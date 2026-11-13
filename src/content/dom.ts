/** Page-reading helpers and the shape every site reader returns. */
import type { JobFacts } from '../engine/judge';

export interface CardRead {
  /** The whole card; dimmed or hidden by status. */
  el: HTMLElement;
  /** The badge is placed inside this element, after its text. */
  anchor: HTMLElement;
  job: JobFacts;
}

export interface DetailRead {
  el: HTMLElement;
  /** The badge is placed straight after this element. */
  anchor: HTMLElement;
  job: JobFacts;
  description?: string;
}

/** Everything that knows one site's page layout. */
export interface SiteAdapter {
  /** Short name, also used to prefix job IDs so sites never collide. */
  id: string;
  /** Whether this reader should run on the page at all. */
  active(url: URL, doc: Document): boolean;
  findCards(doc: Document): CardRead[];
  readDetail(doc: Document, href: string): DetailRead | undefined;
}

/** Marks nodes this extension added, so they are never read back as page content. */
export const OWN = 'data-vsc';

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'TR']);

export const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Text of an element, skipping anything this extension inserted. */
export function pageText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) out += node.nodeValue;
    else if (node.nodeType === 1 && !(node as Element).hasAttribute(OWN)) node.childNodes.forEach(walk);
  };
  walk(el);
  return squash(out);
}

/** Like pageText, but keeps paragraph and list boundaries as line breaks. */
export function blockText(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue;
      return;
    }
    if (node.nodeType !== 1 || (node as Element).hasAttribute(OWN)) return;
    const tag = (node as Element).tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    const block = BLOCK.has(tag);
    if (block) out += '\n';
    node.childNodes.forEach(walk);
    if (block) out += '\n';
  };
  walk(el);
  return out
    .split('\n')
    .map(squash)
    .filter(Boolean)
    .join('\n');
}

/** Each visible run of text with the element that holds it, in page order. */
export function leaves(root: Element): Array<{ el: HTMLElement; text: string }> {
  const out: Array<{ el: HTMLElement; text: string }> = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = squash(node.nodeValue ?? '');
      if (text && node.parentElement) out.push({ el: node.parentElement, text });
    } else if (node.nodeType === 1 && !(node as Element).hasAttribute(OWN)) {
      node.childNodes.forEach(walk);
    }
  };
  walk(root);
  return out;
}

/** First element matching any selector, in order, that has text. */
export function first(root: ParentNode, selectors: string[]): HTMLElement | undefined {
  for (const selector of selectors) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      if (pageText(el)) return el;
    }
  }
  return undefined;
}

/** The heading that shows the job title, for placing the badge. */
export function titleHeading(root: ParentNode, title: string): HTMLElement | undefined {
  const want = squash(title).toLowerCase();
  const headings = [...root.querySelectorAll<HTMLElement>('h1, h2, h3')];
  return (
    headings.find((h) => pageText(h).toLowerCase() === want) ??
    headings.find((h) => pageText(h).toLowerCase().startsWith(want)) ??
    headings.find((h) => h.tagName === 'H1' && pageText(h))
  );
}

/** Reads HTML (e.g. a description inside JSON) as plain text with line breaks. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return blockText(doc.body);
}
