/**
 * Any page that publishes a schema.org JobPosting block for search engines:
 * Lever, Ashby, Workday, Welcome to the Jungle and many company career sites.
 * The block gives title, employer, location, salary and the advert itself, so
 * no layout knowledge is needed except where to put the badge.
 */
import { htmlToText, OWN, squash, titleHeading, type DetailRead, type SiteAdapter } from '../dom';

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD is untyped page data */
type Json = any;

const FLOAT_ID = 'vsc-float';

/** All JobPosting objects in the page's JSON-LD, including ones in arrays and @graph. */
export function findJobPosting(doc: Document): Json | undefined {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent ?? '';
    if (!raw.includes('JobPosting')) continue;
    let data: Json;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const item = stack.pop();
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item)) stack.push(...item);
      else {
        const type = item['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return item;
        if (item['@graph']) stack.push(item['@graph']);
      }
    }
  }
  return undefined;
}

const text = (v: Json): string | undefined => {
  if (typeof v === 'string') return squash(v) || undefined;
  if (v && typeof v === 'object' && typeof v.name === 'string') return squash(v.name) || undefined;
  return undefined;
};

/** "2764 Barclays Capital Inc." (Workday adds an internal company code) -> "Barclays Capital Inc." */
export function cleanEmployer(name: string): string {
  return squash(name.replace(/^\d+\s+/, ''));
}

export function locationText(jp: Json): string | undefined {
  const places = [jp.jobLocation].flat().filter(Boolean);
  const parts = places.map((p: Json) => {
    const a = p.address ?? p;
    if (typeof a === 'string') return a;
    return [text(a.addressLocality), text(a.addressRegion), text(a.addressCountry)].filter(Boolean).join(', ');
  });
  const joined = [...new Set(parts.filter(Boolean))].join('; ');
  if (joined) return joined;
  if (jp.jobLocationType === 'TELECOMMUTE') {
    const where = [jp.applicantLocationRequirements].flat().map(text).filter(Boolean).join(', ');
    return where ? `Remote (${where})` : 'Remote';
  }
  return undefined;
}

const UNIT: Record<string, string> = { HOUR: 'hour', DAY: 'day', MONTH: 'month', YEAR: 'year' };

/** baseSalary as text the salary parser understands, GBP only. */
export function salaryText(jp: Json): string | undefined {
  const s = jp.baseSalary;
  if (!s || typeof s !== 'object') return undefined;
  const currency = s.currency ?? s.value?.currency;
  if (currency && currency !== 'GBP') return undefined;
  const v = s.value ?? s;
  const unit = UNIT[String(v.unitText ?? s.unitText ?? 'YEAR').toUpperCase()];
  if (!unit) return undefined;
  const min = Number(v.minValue ?? v.value);
  const max = Number(v.maxValue ?? v.value ?? min);
  if (!Number.isFinite(min) || min <= 0) return undefined;
  return min === max ? `£${min} a ${unit}` : `£${min} - £${max} a ${unit}`;
}

const EMPLOYMENT: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACTOR: 'Contract',
  TEMPORARY: 'Temporary',
  INTERN: 'Internship',
};

/** The descriptions are HTML, sometimes HTML-escaped a second time. */
export function descriptionText(html: string): string {
  let out = htmlToText(html);
  if (/<\/?(p|li|ul|br|div|strong)\b/i.test(out)) out = htmlToText(out);
  return out;
}

/**
 * The company's own name on hosted career sites, used when the posting
 * names a legal entity the register doesn't know.
 */
export function siteCompany(url: URL): string | undefined {
  const workday = /^([^.]+)\.wd\d+\.myworkday(?:jobs|site)\.com$/.exec(url.hostname);
  if (workday) return workday[1];
  if (/(^|\.)(lever\.co|ashbyhq\.com)$/.test(url.hostname)) return url.pathname.split('/')[1] || undefined;
  const wttj = /\/companies\/([^/]+)\//.exec(url.pathname);
  if (/welcometothejungle\.com$/.test(url.hostname) && wttj) return wttj[1];
  return undefined;
}

/** A fixed corner badge holder for pages with no heading to sit next to. */
function floatingAnchor(doc: Document): HTMLElement {
  let holder = doc.getElementById(FLOAT_ID);
  if (!holder) {
    holder = doc.createElement('div');
    holder.id = FLOAT_ID;
    holder.setAttribute(OWN, '');
    holder.className = 'vsc-float';
    const spot = doc.createElement('span');
    spot.setAttribute(OWN, '');
    holder.appendChild(spot);
    doc.body.appendChild(holder);
  }
  return holder.firstElementChild as HTMLElement;
}

export function readJsonLd(doc: Document, href: string): DetailRead | undefined {
  const jp = findJobPosting(doc);
  if (!jp) return undefined;
  const title = text(jp.title) ?? text(jp.name);
  const employer = text(jp.hiringOrganization);
  if (!title || !employer) return undefined;

  const url = new URL(href);
  const identifier = text(jp.identifier?.value) ?? (typeof jp.identifier === 'string' ? jp.identifier : undefined);
  const jobId = `ld:${url.hostname}:${identifier ?? url.pathname}`;
  const company = cleanEmployer(employer);
  const alt = siteCompany(url);

  return {
    el: doc.body,
    anchor: titleHeading(doc, title) ?? floatingAnchor(doc),
    job: {
      jobId,
      title,
      company,
      companyAlt: alt && alt.toLowerCase() !== company.toLowerCase() ? alt : undefined,
      location: locationText(jp),
      salaryText: salaryText(jp),
      meta: [jp.employmentType].flat().map((t: Json) => EMPLOYMENT[String(t)] ?? '').filter(Boolean).join(' · '),
    },
    description: typeof jp.description === 'string' ? descriptionText(jp.description) : undefined,
  };
}

export const jsonld: SiteAdapter = {
  id: 'jsonld',
  active: (_url, doc) => findJobPosting(doc) !== undefined,
  findCards: () => [],
  readDetail: readJsonLd,
};
