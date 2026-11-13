/**
 * Everything that knows LinkedIn's page layout lives in this file.
 * When badges stop appearing, the selectors below are the place to look;
 * each list is tried in order and falls back to a structural guess.
 */
import { blockText, first, leaves, OWN, pageText, squash, type CardRead, type DetailRead, type SiteAdapter } from './dom';

export { blockText, OWN, pageText, type CardRead, type DetailRead };

const SEL = {
  card: [
    // 2026 layout (/jobs/search-results/): cards are buttons, not links, and carry the job ID in componentkey.
    '[role="button"][componentkey^="job-card-component-ref-"]',
    'li[data-occludable-job-id]',
    'div[data-job-id]',
    '.job-card-container',
    '.job-card-job-posting-card-wrapper',
    '.jobs-search-results__list-item',
    '.base-card',
    '.job-search-card',
  ],
  cardTitle: [
    '.job-card-list__title--link',
    '.job-card-container__link',
    '.job-card-list__title',
    '.job-card-job-posting-card-wrapper__title',
    '.base-search-card__title',
    'a[href*="/jobs/view/"]',
  ],
  cardCompany: [
    '.artdeco-entity-lockup__subtitle',
    '.job-card-container__primary-description',
    '.job-card-container__company-name',
    '.base-search-card__subtitle',
  ],
  detail: [
    '.jobs-search__job-details--container',
    '.jobs-details__main-content',
    '.job-view-layout',
    '.jobs-details',
    '.details-pane__content',
    '.top-card-layout',
  ],
  detailTitle: [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    '.topcard__title',
    'h1',
    'a[href*="/jobs/view/"]',
  ],
  detailCompany: [
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
    'a[href*="/company/"]',
  ],
  description: [
    '[id^="JobDetails_AboutTheJob_"] [data-testid="expandable-text-box"]',
    '[id^="JobDetails_AboutTheJob_"]',
    '#job-details',
    '.jobs-description__content',
    '.jobs-description-content__text',
    '.jobs-box__html-content',
    '.show-more-less-html__markup',
    '.description__text',
    '[class*="jobs-description"]',
  ],
};

const JOB_LINK = 'a[href*="/jobs/view/"]';
/** 2026 layout card: a button whose first paragraph is the title. */
const CARD_2026 = '[role="button"][componentkey^="job-card-component-ref-"]';
const NOT_A_COMPANY = /^(promoted|viewed|applied|saved|easy apply|actively (recruiting|reviewing).*|with verification|\d+ (applicants?|connections?).*|be an early applicant|new|·)$/i;
export function jobIdFromUrl(href: string): string | undefined {
  const current = /[?&]currentJobId=(\d+)/.exec(href);
  if (current) return current[1];
  const view = /\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})(?:[/?#]|$)/.exec(href);
  return view?.[1];
}

function jobIdFromElement(el: Element): string | undefined {
  const key = /^job-card-component-ref-(\d+)$/.exec(el.getAttribute('componentkey') ?? '');
  if (key) return key[1];
  const holder = el.matches('[data-occludable-job-id], [data-job-id], [data-entity-urn]')
    ? el
    : el.querySelector('[data-occludable-job-id], [data-job-id], [data-entity-urn]');
  const attr =
    holder?.getAttribute('data-occludable-job-id') ??
    holder?.getAttribute('data-job-id') ??
    /jobPosting:(\d+)/.exec(holder?.getAttribute('data-entity-urn') ?? '')?.[1];
  if (attr && /^\d+$/.test(attr)) return attr;
  const link = el.matches(JOB_LINK) ? el : el.querySelector(JOB_LINK);
  return link ? jobIdFromUrl(link.getAttribute('href') ?? '') : undefined;
}

/** LinkedIn repeats the title for screen readers; take one clean copy. */
function titleText(el: HTMLElement): string {
  const visible = el.querySelector('[aria-hidden="true"]');
  const strong = el.querySelector('strong');
  const text = pageText(visible ?? strong ?? el) || pageText(el);
  return squash(text.replace(/\bwith verification\b/gi, ''));
}

function salaryLine(texts: Array<{ text: string }>): string | undefined {
  return texts.find((t) => /£\s?\d|\d\s?k?\s?GBP\b/i.test(t.text))?.text;
}

function findDetailRoot(doc: Document): HTMLElement | undefined {
  for (const selector of SEL.detail) {
    const el = doc.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  // 2026 layout: no stable class names, but the description block has a stable id.
  const about = doc.querySelector<HTMLElement>('[id^="JobDetails_AboutTheJob_"]');
  return about?.closest<HTMLElement>('[data-testid="lazy-column"]') ?? about?.parentElement ?? undefined;
}

function readCard(el: HTMLElement): CardRead | undefined {
  const jobId = jobIdFromElement(el);
  if (!jobId) return undefined;

  const titleEl = el.matches(CARD_2026) ? first(el, ['p']) : first(el, SEL.cardTitle);
  if (!titleEl) return undefined; // not rendered yet (LinkedIn fills cards in as you scroll)
  const title = titleText(titleEl);

  const texts = leaves(el);
  let companyEl = first(el, SEL.cardCompany);
  if (!companyEl) {
    // Structural guess: the first line of text after the title.
    const afterTitle = texts.filter((t) => !titleEl.contains(t.el) && titleEl.compareDocumentPosition(t.el) & Node.DOCUMENT_POSITION_FOLLOWING);
    companyEl = afterTitle.find((t) => t.text !== title && !NOT_A_COMPANY.test(t.text))?.el;
  }
  if (!companyEl) return undefined;
  const company = pageText(companyEl);
  if (!title || !company) return undefined;

  return {
    el,
    anchor: companyEl,
    job: { jobId, title, company, salaryText: salaryLine(texts), meta: texts.map((t) => t.text).join(' · ').slice(0, 600) },
  };
}

/** Every job card currently rendered in a results list. */
export function findCards(doc: Document): CardRead[] {
  const detailRoot = findDetailRoot(doc);
  const candidates = new Set<HTMLElement>(doc.querySelectorAll<HTMLElement>(SEL.card.join(',')));

  // Fallback for layouts none of the selectors know: a titled link to a job
  // posting, in a container that links to that one job only.
  for (const link of doc.querySelectorAll<HTMLElement>(JOB_LINK)) {
    if (!pageText(link) || [...candidates].some((c) => c.contains(link))) continue;
    const guess = link.closest<HTMLElement>('li') ?? link.parentElement;
    if (!guess) continue;
    const ids = new Set([...guess.querySelectorAll(JOB_LINK)].map((a) => jobIdFromUrl(a.getAttribute('href') ?? '')));
    if (ids.size === 1) candidates.add(guess);
  }

  const all = [...candidates].filter((el) => !detailRoot?.contains(el) && !el.contains(detailRoot ?? null));
  const outermost = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));

  const cards: CardRead[] = [];
  for (const el of outermost) {
    const card = readCard(el);
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * The tab title is "Job title | Company | LinkedIn" for the open job. Finds
 * the element showing that title, which is more reliable than guessing from
 * the page: a /jobs/view/ page has no title link at all.
 */
function titleFromTabTitle(doc: Document, root: HTMLElement, exclude?: HTMLElement): HTMLElement | undefined {
  const parts = doc.title.replace(/^\(\d+\+?\)\s*/, '').split(' | ');
  if (parts.length < 3 || parts[parts.length - 1].trim() !== 'LinkedIn') return undefined;
  const title = squash(parts[0]);
  if (!title) return undefined;
  for (const el of root.querySelectorAll<HTMLElement>('h1, h2, p, a, span, div')) {
    if (exclude?.contains(el) || pageText(el) !== title) continue;
    // Deepest element with exactly the title text.
    const inner = [...el.querySelectorAll<HTMLElement>('*')].find((c) => pageText(c) === title && !c.matches('[aria-hidden="true"]'));
    return inner ?? el;
  }
  return undefined;
}

/** The open job: the right-hand pane on a search page, or a /jobs/view/ page. */
export function readDetail(doc: Document, href: string): DetailRead | undefined {
  const onViewPage = /\/jobs\/view\//.test(href);
  const el = findDetailRoot(doc) ?? (onViewPage ? (doc.querySelector<HTMLElement>('main') ?? doc.body) : undefined);
  if (!el) return undefined;

  let descriptionEl = first(el, SEL.description);
  if (!descriptionEl) {
    const heading = [...el.querySelectorAll<HTMLElement>('h2, h3')].find((h) => /^about the (job|role)$/i.test(pageText(h)));
    descriptionEl = heading?.parentElement ?? undefined;
  }

  const titleEl = titleFromTabTitle(doc, el, descriptionEl) ?? first(el, SEL.detailTitle);
  const companyEl = first(el, SEL.detailCompany);
  if (!titleEl || !companyEl) return undefined;

  const titleLink = titleEl.matches(JOB_LINK) ? titleEl : titleEl.querySelector(JOB_LINK);
  const jobId = (titleLink ? jobIdFromUrl(titleLink.getAttribute('href') ?? '') : undefined) ?? jobIdFromUrl(href) ?? jobIdFromElement(el);
  if (!jobId) return undefined;

  // Salary and employment type sit in the top card, above the description.
  const top = leaves(el).filter(
    (t) => !descriptionEl || (!descriptionEl.contains(t.el) && descriptionEl.compareDocumentPosition(t.el) & Node.DOCUMENT_POSITION_PRECEDING),
  );

  return {
    el,
    anchor: titleEl.closest<HTMLElement>('h1, h2') ?? titleEl,
    job: {
      jobId,
      title: titleText(titleEl),
      company: pageText(companyEl),
      salaryText: salaryLine(top),
      meta: top.map((t) => t.text).join(' · ').slice(0, 800),
    },
    description: descriptionEl ? blockText(descriptionEl) : undefined,
  };
}

export const linkedin: SiteAdapter = {
  id: 'linkedin',
  active: (url) => /(^|\.)linkedin\.com$/.test(url.hostname) && url.pathname.startsWith('/jobs'),
  findCards,
  readDetail,
};
