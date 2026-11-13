import type { CardRead, DetailRead, SiteAdapter } from '../dom';
import { linkedin } from '../linkedinAdapter';
import { greenhouse } from './greenhouse';
import { indeed } from './indeed';
import { jsonld } from './jsonld';

/** Site-specific readers first; the JobPosting reader covers everything else. */
const ADAPTERS: SiteAdapter[] = [linkedin, indeed, greenhouse, jsonld];

/** Hosts where job pages load late, so it's worth watching them from the start. */
const JOB_HOSTS = /(^|\.)(linkedin\.com|indeed\.(com|co\.uk)|greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|welcometothejungle\.com)$/;

export function isJobHost(url: URL): boolean {
  return JOB_HOSTS.test(url.hostname);
}

export function activeAdapters(url: URL, doc: Document): SiteAdapter[] {
  // LinkedIn pages carry no JobPosting block worth reading alongside it.
  if (/(^|\.)linkedin\.com$/.test(url.hostname)) return linkedin.active(url, doc) ? [linkedin] : [];
  return ADAPTERS.filter((a) => a !== linkedin && a.active(url, doc));
}

export function readPage(adapters: SiteAdapter[], doc: Document, href: string): { cards: CardRead[]; detail?: DetailRead } {
  const cards = adapters.flatMap((a) => a.findCards(doc));
  let detail: DetailRead | undefined;
  for (const a of adapters) {
    detail = a.readDetail(doc, href);
    if (detail) break;
  }
  return { cards, detail };
}
