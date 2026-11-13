import type { Salary } from './types';

const HOURS_PER_WEEK = 37.5;
const DAYS_PER_WEEK = 5;
const WEEKS_PER_YEAR = 52;

/** One pound amount, e.g. "£35,000", "£35k", "£18.50". Not "£1m" or "£2bn". */
const AMOUNT = String.raw`£\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(k\b)?(?![\d,.]*\d)(?!\s?(?:m|mn|bn|million|billion)\b)`;
const UNIT = String.raw`(?:\s?(?:\/|per|a|an|p)\s?\.?\s?(hr|hour|h|day|d|mo|month|annum|year|yr|a)\b)?`;
/** Second half of a range; the pound sign is optional ("£30k-40k"). */
const RANGE_END = String.raw`(?:\s?(?:-|–|—|to)\s?£?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(k\b)?` + UNIT + ')?';
// Groups: 1-3 first amount, 4 its unit, 5-7 second amount, 8 its unit.
const PATTERN = new RegExp(AMOUNT + UNIT + RANGE_END, 'gi');

const CONTEXT = /salary|salaries|\bpay\b|paying|compensation|remuneration|package|basic|\bbase\b|\bote\b|per annum|\bp\.?a\b|starting|circa|up to|rate/i;

type Period = 'year' | 'month' | 'hour' | 'day';

function toNumber(digits: string, decimals: string | undefined, k: string | undefined): number {
  const n = parseFloat(digits.replace(/,/g, '') + (decimals ?? ''));
  return k ? n * 1000 : n;
}

function period(unit: string | undefined): Period | undefined {
  if (!unit) return undefined;
  const u = unit.toLowerCase();
  if (u === 'hr' || u === 'hour' || u === 'h') return 'hour';
  if (u === 'day' || u === 'd') return 'day';
  if (u === 'mo' || u === 'month') return 'month';
  return 'year';
}

function annualise(n: number, p: Period): number {
  if (p === 'hour') return n * HOURS_PER_WEEK * WEEKS_PER_YEAR;
  if (p === 'day') return n * DAYS_PER_WEEK * WEEKS_PER_YEAR;
  if (p === 'month') return n * 12;
  return n;
}

const plausible = (annual: number) => annual >= 10_000 && annual <= 1_000_000;

/**
 * Finds the first plausible pay figure in the text and annualises it.
 * With `requireContext`, a figure only counts if a pay-related word or a
 * unit is nearby; use that for free text such as a job description, where
 * "£5m funding" or "£500 bonus" would otherwise be picked up.
 */
export function parseSalary(text: string | undefined, opts: { requireContext?: boolean } = {}): Salary | undefined {
  if (!text) return undefined;
  // LinkedIn writes "90K GBP/yr - 110K GBP/yr"; read it as "£90K/yr - £110K/yr".
  text = text.replace(/(\d[\d,.]*\s?k?)\s?GBP\b/gi, '£$1');
  for (const m of text.matchAll(PATTERN)) {
    let low = toNumber(m[1], m[2], m[3]);
    let high = m[5] !== undefined ? toNumber(m[5], m[6], m[7]) : low;
    // "£30-40k": the k applies to both ends.
    if (m[5] !== undefined && m[7] && !m[3] && low < 1000) low *= 1000;
    if (high < low) high = low;

    const unit = m[8] ?? m[4];
    const p = period(unit) ?? 'year';
    const min = annualise(low, p);
    const max = annualise(high, p);
    if (!plausible(min) || !plausible(max)) continue;

    if (opts.requireContext && !unit) {
      const start = Math.max(0, (m.index ?? 0) - 60);
      const end = (m.index ?? 0) + m[0].length + 30;
      if (!CONTEXT.test(text.slice(start, end))) continue;
    }
    return { min: Math.round(min), max: Math.round(max), raw: m[0].trim() };
  }
  return undefined;
}

export type SalaryCheck = 'meets' | 'below' | 'straddles' | 'unknown';

/** A range counts as below the floor only when its top end is below it. */
export function checkSalary(salary: Salary | undefined, floor: number): SalaryCheck {
  if (!salary) return 'unknown';
  if (salary.min >= floor) return 'meets';
  if (salary.max >= floor) return 'straddles';
  return 'below';
}

export function formatMoney(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `£${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `£${n}`;
}

export function formatSalary(s: Salary): string {
  return s.min === s.max ? formatMoney(s.min) : `${formatMoney(s.min)}–${formatMoney(s.max)}`;
}
