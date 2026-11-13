import { RegisterIndex } from '../engine/matcher';
import type { CompanyMatch } from '../engine/types';
import { STORAGE, type BackgroundRequest, type Broadcast, type MatchResponse, type RegisterStatus, type SearchResponse } from '../messages';
import { findCsvUrl, parseRegisterCsv, REGISTER_PAGE } from '../register/parse';
import { loadRegister, saveRegister, type RegisterMeta } from '../register/store';

const ALARM = 'refresh-register';
const WEEK_MINUTES = 7 * 24 * 60;
/** A register this small means the download or the format is broken. */
const MIN_PLAUSIBLE_ROWS = 10_000;

// The worker is unloaded when idle, so the index is rebuilt lazily from IndexedDB.
let indexPromise: Promise<RegisterIndex | undefined> | undefined;
let refreshPromise: Promise<void> | undefined;

function getIndex(): Promise<RegisterIndex | undefined> {
  indexPromise ??= loadRegister()
    .then((stored) => (stored ? new RegisterIndex(stored.names) : undefined))
    .catch((err) => {
      console.error('[visa-checker] could not load register', err);
      indexPromise = undefined;
      return undefined;
    });
  return indexPromise;
}

async function getStatus(): Promise<RegisterStatus> {
  const stored = await chrome.storage.local.get(STORAGE.registerStatus);
  const status = (stored[STORAGE.registerStatus] as RegisterStatus | undefined) ?? { refreshing: false };
  return { ...status, refreshing: refreshPromise !== undefined };
}

async function setStatus(patch: Partial<RegisterStatus>): Promise<void> {
  const current = await getStatus();
  await chrome.storage.local.set({ [STORAGE.registerStatus]: { ...current, ...patch } });
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).hostname}`);
  return res.text();
}

async function downloadRegister(): Promise<void> {
  const csvUrl = findCsvUrl(await fetchText(REGISTER_PAGE));
  if (!csvUrl) throw new Error('No CSV link found on the GOV.UK register page');

  const names = parseRegisterCsv(await fetchText(csvUrl));
  if (names.length < MIN_PLAUSIBLE_ROWS) {
    throw new Error(`Register only had ${names.length} Skilled Worker sponsors; keeping the old copy`);
  }

  const meta: RegisterMeta = { updatedAt: new Date().toISOString(), count: names.length, sourceUrl: csvUrl };
  await saveRegister({ ...meta, names });
  indexPromise = Promise.resolve(new RegisterIndex(names));
  await setStatus({ meta, lastError: undefined });
  await broadcast({ type: 'register-updated' });
}

/** Refreshes the register. On failure the old copy stays in place. */
function refresh(): Promise<void> {
  refreshPromise ??= (async () => {
    try {
      await setStatus({ refreshing: true });
      await downloadRegister();
    } catch (err) {
      console.error('[visa-checker] register refresh failed', err);
      await setStatus({ lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      refreshPromise = undefined;
      await setStatus({ refreshing: false });
    }
  })();
  return refreshPromise;
}

async function broadcast(message: Broadcast): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => (tab.id === undefined ? undefined : chrome.tabs.sendMessage(tab.id, message).catch(() => undefined))),
  );
}

async function ensureSchedule(): Promise<void> {
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { periodInMinutes: WEEK_MINUTES, delayInMinutes: WEEK_MINUTES });
  }
  const { meta } = await getStatus();
  const age = meta ? Date.now() - new Date(meta.updatedAt).getTime() : Infinity;
  if (age > WEEK_MINUTES * 60_000) void refresh();
}

chrome.runtime.onInstalled.addListener(() => void ensureSchedule());
chrome.runtime.onStartup.addListener(() => void ensureSchedule());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void refresh();
});

async function handle(request: BackgroundRequest): Promise<unknown> {
  switch (request.type) {
    case 'match': {
      const index = await getIndex();
      const matches: Record<string, CompanyMatch> = {};
      if (index) for (const name of request.names) matches[name] = index.match(name);
      else void ensureSchedule();
      return { matches, registerLoaded: index !== undefined } satisfies MatchResponse;
    }
    case 'search': {
      const index = await getIndex();
      return { names: index?.search(request.query) ?? [] } satisfies SearchResponse;
    }
    case 'refresh':
      await refresh();
      return getStatus();
    case 'status':
      return getStatus();
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handle(request).then(sendResponse, (err) => {
    console.error('[visa-checker] request failed', request.type, err);
    sendResponse(undefined);
  });
  return true;
});
