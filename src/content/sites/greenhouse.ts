/**
 * Greenhouse job pages: job-boards.greenhouse.io, the older boards.greenhouse.io,
 * and the same pages embedded in a frame on a company's own careers site.
 * They carry no JobPosting data, so the layout is read directly.
 */
import { blockText, first, pageText, squash, type DetailRead, type SiteAdapter } from '../dom';

const SEL = {
  title: ['.job__title h1', '.app-title', '#header h1', 'h1'],
  company: ['.company-name'],
  location: ['.job__location', '.location'],
  description: ['.job__description', '#content'],
};

/** "Job Application for Graduate Engineer at Monzo" -> "Monzo". */
export function companyFromTitle(title: string): string | undefined {
  const m = / at (.+?)\s*$/.exec(title);
  return m ? squash(m[1]) : undefined;
}

export function readGreenhouse(doc: Document, href: string): DetailRead | undefined {
  const url = new URL(href);
  const id = /\/jobs\/(\d+)/.exec(url.pathname)?.[1] ?? url.searchParams.get('token') ?? url.searchParams.get('gh_jid');
  if (!id) return undefined;
  const titleEl = first(doc, SEL.title);
  if (!titleEl) return undefined;

  const slug = url.searchParams.get('for') ?? url.pathname.split('/').filter(Boolean)[0];
  const companyEl = first(doc, SEL.company);
  const company =
    (companyEl && squash(pageText(companyEl).replace(/^at\s+/i, ''))) || companyFromTitle(doc.title) || slug;
  if (!company) return undefined;

  const locationEl = first(doc, SEL.location);
  const descriptionEl = first(doc, SEL.description);

  return {
    el: doc.body,
    anchor: titleEl,
    job: {
      jobId: `gh:${id}`,
      title: pageText(titleEl),
      company,
      companyAlt: slug && slug.toLowerCase() !== company.toLowerCase() ? slug : undefined,
      location: locationEl ? pageText(locationEl) : undefined,
    },
    description: descriptionEl ? blockText(descriptionEl) : undefined,
  };
}

export const greenhouse: SiteAdapter = {
  id: 'greenhouse',
  active: (url) => /(^|\.)greenhouse\.io$/.test(url.hostname),
  findCards: () => [],
  readDetail: readGreenhouse,
};
