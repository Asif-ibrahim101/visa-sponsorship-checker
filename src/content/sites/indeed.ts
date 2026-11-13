/** Indeed search results, the open-job pane, and stand-alone /viewjob pages. */
import { blockText, first, leaves, pageText, squash, type CardRead, type DetailRead, type SiteAdapter } from '../dom';

const SEL = {
  card: ['.job_seen_beacon', '.cardOutline', '[data-testid="slider_item"]'],
  cardTitle: ['a[data-jk] span[id^="jobTitle"]', 'h2.jobTitle span', 'a[data-jk]'],
  cardCompany: ['[data-testid="company-name"]', '.companyName'],
  cardLocation: ['[data-testid="text-location"]', '.companyLocation'],
  cardSalary: ['[data-testid*="salary-snippet"]', '.salary-snippet-container', '.estimated-salary'],
  pane: ['.jobsearch-RightPane', '#jobsearch-ViewjobPaneWrapper', '[data-testid="viewjob-main-content"]', '#viewJobSSRRoot', '.jobsearch-ViewJobLayout'],
  title: ['[data-testid="vj-job-title"]', '[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title', 'h1', 'h2'],
  company: ['[data-testid="inlineHeader-companyName"]', 'a[href*="/cmp/"]', '[data-company-name]'],
  location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]', '[data-testid="company-info-metadata"]'],
  salary: ['[data-testid="structured-job-summary"]', '#salaryInfoAndJobType'],
  description: ['#jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]'],
};

const cleanTitle = (t: string) => squash(t.replace(/\s*-\s*job post\s*$/i, ''));
const hasPounds = (t: string) => /£\s?\d/.test(t);

function readCard(beacon: HTMLElement): CardRead | undefined {
  const link = beacon.querySelector<HTMLElement>('a[data-jk]');
  const jk = link?.getAttribute('data-jk');
  if (!jk) return undefined;
  const titleEl = first(beacon, SEL.cardTitle);
  const companyEl = first(beacon, SEL.cardCompany);
  if (!titleEl || !companyEl) return undefined;
  const texts = leaves(beacon);
  const salaryEl = first(beacon, SEL.cardSalary);
  return {
    // Hide the whole list item, not just its inner box.
    el: beacon.closest<HTMLElement>('li') ?? beacon,
    anchor: companyEl,
    job: {
      jobId: `indeed:${jk}`,
      title: cleanTitle(pageText(titleEl)),
      company: pageText(companyEl),
      location: first(beacon, SEL.cardLocation) ? pageText(first(beacon, SEL.cardLocation)!) : undefined,
      salaryText: salaryEl ? pageText(salaryEl) : texts.find((t) => hasPounds(t.text))?.text,
      meta: texts.map((t) => t.text).join(' · ').slice(0, 600),
    },
  };
}

export function findIndeedCards(doc: Document): CardRead[] {
  const beacons = new Set<HTMLElement>();
  for (const sel of SEL.card) for (const el of doc.querySelectorAll<HTMLElement>(sel)) beacons.add(el);
  // Keep the outermost of nested matches.
  const all = [...beacons];
  const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  return outer.map(readCard).filter((c): c is CardRead => c !== undefined);
}

function jkFromUrl(href: string): string | undefined {
  return /[?&](?:vjk|jk)=([0-9a-f]{8,})/i.exec(href)?.[1];
}

export function readIndeedDetail(doc: Document, href: string): DetailRead | undefined {
  const pane = first(doc, SEL.pane);
  if (!pane) return undefined;
  const jk = jkFromUrl(href);
  if (!jk) return undefined;
  const titleEl = first(pane, SEL.title);
  if (!titleEl) return undefined;

  // The pane's own fields move around; the matching card is a reliable fallback.
  const card = findIndeedCards(doc).find((c) => c.job.jobId === `indeed:${jk}`);
  const companyEl = first(pane, SEL.company);
  const company = (companyEl && pageText(companyEl)) || card?.job.company;
  if (!company) return undefined;

  const locationEl = first(pane, SEL.location);
  const salaryEl = first(pane, SEL.salary);
  let descriptionEl = first(pane, SEL.description);
  if (!descriptionEl) {
    const heading = pane.querySelector('[data-testid="vj-job-description-heading"]');
    descriptionEl = heading?.parentElement ?? undefined;
  }

  return {
    el: pane,
    anchor: titleEl,
    job: {
      jobId: `indeed:${jk}`,
      title: cleanTitle(pageText(titleEl)),
      company,
      location: (locationEl && pageText(locationEl)) || card?.job.location,
      salaryText: (salaryEl && hasPounds(pageText(salaryEl)) ? pageText(salaryEl) : undefined) ?? card?.job.salaryText,
      meta: [salaryEl ? pageText(salaryEl) : '', card?.job.meta ?? ''].join(' · ').slice(0, 800),
    },
    description: descriptionEl ? blockText(descriptionEl) : undefined,
  };
}

export const indeed: SiteAdapter = {
  id: 'indeed',
  active: (url) => /(^|\.)indeed\.(com|co\.uk)$/.test(url.hostname),
  findCards: findIndeedCards,
  readDetail: readIndeedDetail,
};
