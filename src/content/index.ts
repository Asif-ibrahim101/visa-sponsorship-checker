import { readExperience } from '../engine/experience';
import { judge, type DescriptionSignals, type JobFacts } from '../engine/judge';
import { normaliseName } from '../engine/normalise';
import { classifyText, phraseStamp } from '../engine/phrases';
import { roleFlags } from '../engine/roleLevel';
import { parseSalary } from '../engine/salary';
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES, type CompanyMatch, type Overrides, type Settings, type Status, type Verdict } from '../engine/types';
import {
  STORAGE,
  type BackgroundRequest,
  type Broadcast,
  type ContentRequest,
  type CountsResponse,
  type MatchResponse,
  type SearchResponse,
} from '../messages';
import { getOverrides, getSettings, saveOverrides } from '../storage';
import { renderBadge, type BadgeHandlers, type OverrideChange } from './badge';
import { OWN } from './dom';
import { activeAdapters, isJobHost, readPage } from './sites';

interface CachedSignals extends DescriptionSignals {
  stamp: string;
  /** Length of the description the signals came from; a longer read replaces it. */
  length: number;
  at: number;
}

const SCAN_DELAY_MS = 120;
const MAX_CACHED_JOBS = 1500;
/** Shorter than this and the description is still loading. */
const MIN_DESCRIPTION = 120;

let settings: Settings = DEFAULT_SETTINGS;
let overrides: Overrides = EMPTY_OVERRIDES;
let signals: Record<string, CachedSignals> = {};
const matches = new Map<string, CompanyMatch>();
const requested = new Set<string>();
let lastStatuses: Status[] = [];
let lastEntryLevel = 0;
let scanTimer: number | undefined;
let saveTimer: number | undefined;

/** Whether a site reader recognised this page on the last scan. */
let onJobsPage = false;
let observing = false;
const stamp = () => phraseStamp(settings);

function send<T>(request: BackgroundRequest): Promise<T | undefined> {
  return chrome.runtime.sendMessage(request).catch(() => undefined) as Promise<T | undefined>;
}

const handlers: BadgeHandlers = {
  onOverride: (change) => void applyOverride(change),
  searchRegister: async (query) => (await send<SearchResponse>({ type: 'search', query }))?.names ?? [],
};

async function applyOverride(change: OverrideChange): Promise<void> {
  const next: Overrides = { companies: { ...overrides.companies }, jobs: { ...overrides.jobs } };
  if (change.scope === 'company') {
    const key = normaliseName(change.company);
    if (change.value) next.companies[key] = change.value;
    else delete next.companies[key];
  } else if (change.value) next.jobs[change.jobId] = change.value;
  else delete next.jobs[change.jobId];
  overrides = next;
  await saveOverrides(next);
  scan();
}

function applyDisplaySettings(): void {
  const root = document.documentElement;
  root.classList.toggle('vsc-dim', settings.dimming && onJobsPage);
  root.classList.toggle('vsc-hide', settings.hide && onJobsPage);
  root.classList.toggle('vsc-hide-agency', settings.hideAgency && onJobsPage);
  root.style.setProperty('--vsc-opacity', String(settings.opacity));
}

function rememberDescription(job: JobFacts, description: string): void {
  const known = signals[job.jobId];
  if (known && known.stamp === stamp() && known.length >= description.length) return;
  signals[job.jobId] = {
    text: classifyText(description, settings),
    salary: parseSalary(description, { requireContext: true }),
    roleFlags: roleFlags({ title: '', description }),
    experience: readExperience(description),
    stamp: stamp(),
    length: description.length,
    at: Date.now(),
  };
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistSignals, 1000);
}

function persistSignals(): void {
  const entries = Object.entries(signals);
  if (entries.length > MAX_CACHED_JOBS) {
    entries.sort((a, b) => b[1].at - a[1].at);
    signals = Object.fromEntries(entries.slice(0, MAX_CACHED_JOBS));
  }
  void chrome.storage.local.set({ [STORAGE.signals]: signals });
}

function describedFor(jobId: string): DescriptionSignals | undefined {
  const cached = signals[jobId];
  return cached && cached.stamp === stamp() ? cached : undefined;
}

async function requestMatches(names: string[]): Promise<void> {
  names.forEach((n) => requested.add(n));
  const response = await send<MatchResponse>({ type: 'match', names });
  names.forEach((n) => requested.delete(n));
  // No register yet: the background worker is downloading it and will broadcast when done.
  if (!response?.registerLoaded) return;
  for (const [name, match] of Object.entries(response.matches)) matches.set(name, match);
  scan();
}

/**
 * The register match for a job: the posted company, or the site's own name
 * for the employer (e.g. "barclays" on Workday) when that one is licensed.
 */
function matchFor(job: JobFacts): CompanyMatch | undefined {
  const main = matches.get(job.company);
  if (!main || main.licensed || !job.companyAlt) return main;
  const alt = matches.get(job.companyAlt);
  if (alt === undefined) return undefined; // still loading
  return alt.licensed ? alt : main;
}

function scan(): void {
  window.clearTimeout(scanTimer);
  scanTimer = undefined;
  const adapters = activeAdapters(new URL(location.href), document);
  onJobsPage = adapters.length > 0;
  applyDisplaySettings();
  if (!onJobsPage) {
    lastStatuses = [];
    lastEntryLevel = 0;
    return;
  }

  const { cards, detail } = readPage(adapters, document, location.href);

  if (detail?.description && detail.description.length >= MIN_DESCRIPTION) {
    // LinkedIn changes the URL before the pane; don't credit the old advert to the new job.
    const card = cards.find((c) => c.job.jobId === detail.job.jobId);
    const stale = card !== undefined && normaliseName(card.job.title) !== normaliseName(detail.job.title);
    if (!stale) rememberDescription(detail.job, detail.description);
  }

  const missing = new Set<string>();
  const need = (company: string) => {
    if (!matches.has(company) && !requested.has(company)) missing.add(company);
  };
  for (const job of [...cards.map((c) => c.job), ...(detail ? [detail.job] : [])]) {
    need(job.company);
    if (job.companyAlt) need(job.companyAlt);
  }
  if (missing.size) void requestMatches([...missing]);

  const context = (job: JobFacts) => ({
    jobId: job.jobId,
    company: job.company,
    hasCompanyOverride: normaliseName(job.company) in overrides.companies,
    hasJobOverride: job.jobId in overrides.jobs,
  });

  const statuses: Status[] = [];
  let entry = 0;
  const count = (verdict: Verdict) => {
    statuses.push(verdict.status);
    if (verdict.entryLevel) entry++;
  };
  for (const card of cards) {
    const match = matchFor(card.job);
    if (!match) continue;
    const verdict = judge(card.job, match, describedFor(card.job.jobId), settings, overrides);
    count(verdict);
    renderBadge(card.anchor, 'inside', 'small', verdict, context(card.job), handlers);
    if (card.el.dataset.vscStatus !== verdict.status) card.el.dataset.vscStatus = verdict.status;
  }

  if (detail) {
    const match = matchFor(detail.job);
    if (match) {
      const verdict = judge(detail.job, match, describedFor(detail.job.jobId), settings, overrides);
      renderBadge(detail.anchor, 'after', 'large', verdict, context(detail.job), handlers);
      // A single job page has no list; count the job itself.
      if (cards.length === 0) count(verdict);
    }
  }
  lastStatuses = statuses;
  lastEntryLevel = entry;
}

function scheduleScan(): void {
  scanTimer ??= window.setTimeout(scan, SCAN_DELAY_MS);
}

function isOwn(node: Node): boolean {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return el?.closest(`[${OWN}]`) != null;
}

/** Starts watching the page for changes; only done on pages with jobs. */
function begin(): void {
  if (observing) return;
  observing = true;
  new MutationObserver((mutations) => {
    const pageChanged = mutations.some(
      (m) => !isOwn(m.target) && ([...m.addedNodes].some((n) => !isOwn(n)) || [...m.removedNodes].some((n) => !isOwn(n)) || m.type === 'characterData'),
    );
    if (pageChanged) scheduleScan();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
}

function maybeBegin(): void {
  const url = new URL(location.href);
  if (isJobHost(url) || activeAdapters(url, document).length > 0) begin();
}

/**
 * On other sites, look for a job posting a few times after each page change
 * (single-page apps change the address without reloading), and otherwise stay idle.
 */
function watchForJobs(): void {
  let lastHref = '';
  let checks = 0;
  const timer = window.setInterval(() => {
    if (observing) {
      window.clearInterval(timer);
      return;
    }
    if (location.href !== lastHref) {
      lastHref = location.href;
      checks = 0;
    }
    if (checks++ < 4) maybeBegin();
  }, 1500);
}

function start(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE.settings]) settings = { ...DEFAULT_SETTINGS, ...(changes[STORAGE.settings].newValue as Partial<Settings>) };
    if (changes[STORAGE.overrides]) {
      const o = changes[STORAGE.overrides].newValue as Partial<Overrides> | undefined;
      overrides = { companies: o?.companies ?? {}, jobs: o?.jobs ?? {} };
    }
    if ((changes[STORAGE.settings] || changes[STORAGE.overrides]) && observing) scan();
  });

  chrome.runtime.onMessage.addListener((message: Broadcast | ContentRequest, _sender, sendResponse) => {
    if (message.type === 'register-updated') {
      // Every cached match came from the old register.
      matches.clear();
      if (observing) scan();
    } else if (message.type === 'counts') {
      const counts: CountsResponse['counts'] = {};
      for (const status of lastStatuses) counts[status] = (counts[status] ?? 0) + 1;
      sendResponse({ counts, total: lastStatuses.length, entryLevel: lastEntryLevel } satisfies CountsResponse);
    }
    return undefined;
  });

  maybeBegin();
  if (!observing) watchForJobs();
}

/** Frames only matter for career pages embedded in a company's own site. */
const EMBEDDABLE = /(^|\.)(greenhouse\.io|ashbyhq\.com|lever\.co|myworkdayjobs\.com|myworkdaysite\.com)$/;

async function init(): Promise<void> {
  if (window.top !== window && !EMBEDDABLE.test(location.hostname)) return;
  try {
    const stored = await chrome.storage.local.get(STORAGE.signals);
    [settings, overrides] = await Promise.all([getSettings(), getOverrides()]);
    signals = (stored[STORAGE.signals] as Record<string, CachedSignals> | undefined) ?? {};
  } catch (err) {
    console.error('[visa-checker] could not load saved state', err);
  }
  start();
}

void init();
