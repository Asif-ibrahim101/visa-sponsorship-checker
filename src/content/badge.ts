import { STATUS_LABEL, type CompanyOverride, type Status, type Verdict } from '../engine/types';
import { OWN } from './dom';

export type OverrideChange =
  | { scope: 'company'; company: string; value: CompanyOverride | undefined }
  | { scope: 'job'; jobId: string; value: Status | undefined };

export interface BadgeContext {
  jobId: string;
  company: string;
  hasCompanyOverride: boolean;
  hasJobOverride: boolean;
}

export interface BadgeHandlers {
  onOverride(change: OverrideChange): void;
  searchRegister(query: string): Promise<string[]>;
}

type BadgeEl = HTMLElement & { vscVerdict?: Verdict; vscContext?: BadgeContext };

const JOB_STATUSES: Status[] = ['sponsors', 'possible', 'unlikely', 'no'];

function own<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.setAttribute(OWN, '');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Adds or updates the badge for a job. Touches the page only when something changed. */
export function renderBadge(
  anchor: HTMLElement,
  position: 'inside' | 'after',
  size: 'small' | 'large',
  verdict: Verdict,
  context: BadgeContext,
  handlers: BadgeHandlers,
): void {
  const existing = (position === 'inside' ? anchor.querySelector(':scope > .vsc-badge') : anchor.nextElementSibling) as BadgeEl | null;
  let badge = existing?.classList.contains('vsc-badge') ? existing : null;

  if (!badge) {
    badge = own('span', 'vsc-badge') as BadgeEl;
    badge.tabIndex = 0;
    badge.setAttribute('role', 'note');
    const el = badge;
    el.addEventListener('mouseenter', () => showTip(el));
    el.addEventListener('focus', () => showTip(el));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('blur', hideTip);
    el.addEventListener('click', (e) => {
      // Cards are links; a click on the badge shouldn't open the job.
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      if (el.vscContext) openMenu(e.clientX, e.clientY, el.vscContext, handlers);
    });
    if (position === 'inside') anchor.appendChild(badge);
    else anchor.insertAdjacentElement('afterend', badge);
  }

  badge.vscVerdict = verdict;
  badge.vscContext = context;

  const key = `${verdict.status}|${verdict.provisional}|${verdict.uncertainMatch}|${size}`;
  if (badge.dataset.vscKey !== key) {
    badge.dataset.vscKey = key;
    badge.className = `vsc-badge vsc-${size} vsc-${verdict.status}${verdict.provisional ? ' vsc-provisional' : ''}`;
    // "?" marks a register match worth checking in the hover.
    badge.textContent = STATUS_LABEL[verdict.status] + (verdict.uncertainMatch ? ' ?' : '');
  }
  const label = `${STATUS_LABEL[verdict.status]}${verdict.uncertainMatch ? ' (check the company match)' : ''}: ${verdict.reason}`;
  const extras: Extra[] = [];
  if (verdict.entryLevel) extras.push({ kind: 'level', label: 'Entry level', title: `Entry level: ${verdict.entryLevel}` });
  if (verdict.outsideUk) extras.push({ kind: 'abroad', label: 'Outside UK', title: `Based in ${verdict.outsideUk}` });
  renderExtras(badge, size, extras);
  if (badge.getAttribute('aria-label') !== label) badge.setAttribute('aria-label', label);
}

interface Extra {
  kind: 'level' | 'abroad';
  label: string;
  title: string;
}

/** Extra pills (Entry level, Outside UK), kept straight after the status badge. */
function renderExtras(badge: HTMLElement, size: 'small' | 'large', extras: Extra[]): void {
  const existing: HTMLElement[] = [];
  for (let next = badge.nextElementSibling; next?.classList.contains('vsc-extra'); next = next.nextElementSibling) {
    existing.push(next as HTMLElement);
  }
  const want = extras.map((e) => `${e.kind}|${size}`).join(',');
  if (existing.map((e) => e.dataset.vscKey).join(',') !== want) {
    existing.forEach((e) => e.remove());
    let after: Element = badge;
    for (const extra of extras) {
      const pill = own('span', `vsc-extra vsc-${extra.kind} vsc-${size}`, extra.label);
      pill.dataset.vscKey = `${extra.kind}|${size}`;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      after.insertAdjacentElement('afterend', pill);
      after = pill;
    }
    existing.length = 0;
    for (let next = badge.nextElementSibling; next?.classList.contains('vsc-extra'); next = next.nextElementSibling) {
      existing.push(next as HTMLElement);
    }
  }
  existing.forEach((pill, i) => {
    if (pill.title !== extras[i].title) {
      pill.title = extras[i].title;
      pill.setAttribute('aria-label', extras[i].title);
    }
  });
}

// ---- hover reason ----

let tip: HTMLElement | undefined;

function showTip(badge: BadgeEl): void {
  const verdict = badge.vscVerdict;
  if (!verdict || menu) return;
  hideTip();
  tip = own('div', 'vsc-tip');
  tip.setAttribute('role', 'tooltip');
  tip.appendChild(own('div', 'vsc-tip-reason', verdict.reason));
  for (const line of verdict.details) tip.appendChild(own('div', 'vsc-tip-line', line));
  tip.appendChild(own('div', 'vsc-tip-hint', 'Right-click the badge to correct it'));
  document.body.appendChild(tip);
  place(tip, badge.getBoundingClientRect().left, badge.getBoundingClientRect().bottom + 6);
}

function hideTip(): void {
  tip?.remove();
  tip = undefined;
}

function place(el: HTMLElement, x: number, y: number): void {
  const { width, height } = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  el.style.top = `${Math.max(8, y + height > window.innerHeight - 8 ? y - height - 34 : y)}px`;
}

// ---- right-click override menu ----

let menu: HTMLElement | undefined;

function closeMenu(): void {
  menu?.remove();
  menu = undefined;
  document.removeEventListener('mousedown', onOutside, true);
  document.removeEventListener('keydown', onEscape, true);
}

function onOutside(e: MouseEvent): void {
  if (menu && !menu.contains(e.target as Node)) closeMenu();
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu();
}

function item(label: string, action: () => void): HTMLElement {
  const button = own('button', 'vsc-menu-item', label);
  button.type = 'button';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  });
  return button;
}

function openMenu(x: number, y: number, ctx: BadgeContext, handlers: BadgeHandlers): void {
  closeMenu();
  const el = (menu = own('div', 'vsc-menu'));
  el.setAttribute('role', 'menu');

  const apply = (change: OverrideChange) => {
    closeMenu();
    handlers.onOverride(change);
  };
  const company = (value: CompanyOverride | undefined) => apply({ scope: 'company', company: ctx.company, value });

  el.appendChild(own('div', 'vsc-menu-title', ctx.company));
  el.appendChild(item('Company sponsors', () => company({ kind: 'sponsors' })));
  el.appendChild(item("Company doesn't sponsor", () => company({ kind: 'no' })));
  el.appendChild(item('Link to a register entry…', () => showLinkPicker(el, ctx, handlers, (name) => company({ kind: 'link', registerName: name }))));
  if (ctx.hasCompanyOverride) el.appendChild(item('Clear company override', () => company(undefined)));

  el.appendChild(own('div', 'vsc-menu-title', 'This job only'));
  for (const status of JOB_STATUSES) {
    el.appendChild(item(`Mark as ${STATUS_LABEL[status]}`, () => apply({ scope: 'job', jobId: ctx.jobId, value: status })));
  }
  if (ctx.hasJobOverride) el.appendChild(item('Clear job override', () => apply({ scope: 'job', jobId: ctx.jobId, value: undefined })));

  document.body.appendChild(el);
  place(el, x, y);
  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onEscape, true);
}

function showLinkPicker(el: HTMLElement, ctx: BadgeContext, handlers: BadgeHandlers, choose: (name: string) => void): void {
  el.replaceChildren(own('div', 'vsc-menu-title', `Register entry for ${ctx.company}`));
  const input = own('input', 'vsc-menu-input');
  input.type = 'search';
  input.placeholder = 'Search the sponsor register';
  input.value = ctx.company;
  const results = own('div', 'vsc-menu-results');
  el.append(input, results);

  let latest = 0;
  const search = async () => {
    const run = ++latest;
    const names = await handlers.searchRegister(input.value);
    if (run !== latest) return;
    results.replaceChildren(
      ...(names.length ? names.map((name) => item(name, () => choose(name))) : [own('div', 'vsc-menu-empty', 'No register entries match')]),
    );
  };
  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(search, 200);
  });
  // LinkedIn has page-wide keyboard shortcuts; keep typing inside the box.
  input.addEventListener('keydown', (e) => e.stopPropagation());
  input.focus();
  input.select();
  void search();
}
