import type { TextSignals } from './types';

/**
 * Phrase syntax: plain text, case-insensitive, any whitespace between words.
 * A word in brackets is optional: "must have (the) right to work".
 */

/** Explicitly rules out sponsorship. */
export const HARD_NEGATIVE = [
  'no sponsorship',
  'no visa sponsorship',
  'unable to sponsor',
  'cannot sponsor',
  'can not sponsor',
  "can't sponsor",
  'will not sponsor',
  "won't sponsor",
  'do not sponsor',
  "don't sponsor",
  'does not sponsor',
  'not able to sponsor',
  'not able to offer (visa) sponsorship',
  'unable to offer (visa) sponsorship',
  'unable to provide (visa) sponsorship',
  'cannot offer (visa) sponsorship',
  'cannot provide (visa) sponsorship',
  'do not offer (visa) sponsorship',
  'do not provide (visa) sponsorship',
  'does not offer (visa) sponsorship',
  'not offer (visa) sponsorship',
  'not offering (visa) sponsorship',
  'sponsorship is not available',
  'sponsorship not available',
  'sponsorship is unavailable',
  'not eligible for (visa) sponsorship',
  'without requiring (visa) sponsorship',
  'without (the) need for (visa) sponsorship',
  'without sponsorship',
  'UK nationals only',
  'British nationals only',
  'British citizens only',
  'sole UK national',
  'SC clearance',
  'SC cleared',
  'DV clearance',
  'DV cleared',
  'eligible for security clearance',
  'eligible for SC',
];

/**
 * Often boilerplate: employers that do sponsor use these too, so on their
 * own they only make a job Unlikely, never No.
 */
export const SOFT_NEGATIVE = [
  'must have (the) right to work',
  'must already have (the) right to work',
  'must possess (the) right to work',
  'must hold (the) right to work',
  'existing right to work',
  'full right to work',
  'unrestricted right to work',
  'permanent right to work',
  'already have (the) right to work',
];

export const POSITIVE = [
  'visa sponsorship available',
  'visa sponsorship is available',
  'sponsorship available',
  'sponsorship is available',
  'sponsorship provided',
  'sponsorship is provided',
  'we sponsor visas',
  'we can sponsor',
  'we are able to sponsor',
  'we do sponsor',
  'we offer (visa) sponsorship',
  'we provide (visa) sponsorship',
  'offer(s) visa sponsorship',
  'skilled worker visa sponsorship',
  'skilled worker sponsorship',
  'open to sponsorship',
  'open to sponsoring',
  'happy to sponsor',
  'able to offer (visa) sponsorship',
  'can offer (visa) sponsorship',
  'can provide (visa) sponsorship',
  'visa sponsorship offered',
  'will sponsor',
  'certificate of sponsorship',
];

/** Words that flip a positive phrase when they appear just before it. */
const NEGATOR =
  /\b(no|not|non|never|unable|cannot|can't|cant|won't|wont|don't|dont|doesn't|doesnt|isn't|isnt|aren't|arent|without|unfortunately|neither|nor)\b/i;
const GUARD_WINDOW = 45;

interface Hit {
  phrase: string;
  start: number;
  end: number;
}

export function phraseToRegex(phrase: string): RegExp {
  const parts = phrase
    .trim()
    .split(/\s+/)
    .map((word) => {
      const optional = /^\((.+)\)$/.exec(word);
      const glued = /^(.+)\((.+)\)$/.exec(word);
      if (optional) return { src: escape(optional[1]), optional: true };
      if (glued) return { src: `${escape(glued[1])}(?:${escape(glued[2])})?`, optional: false };
      return { src: escape(word), optional: false };
    });

  let src = '';
  parts.forEach((part, i) => {
    const sep = i === 0 ? '' : String.raw`[\s\u00a0-]+`;
    src += part.optional ? `(?:${sep}${part.src})?` : sep + part.src;
  });
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${src}(?![\p{L}\p{N}])`, 'giu');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
}

function find(text: string, phrases: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const phrase of phrases) {
    if (!phrase.trim()) continue;
    for (const m of text.matchAll(phraseToRegex(phrase))) {
      hits.push({ phrase: m[0].replace(/\s+/g, ' '), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  return hits;
}

/** True when a negating word sits before the hit in the same sentence. */
function negated(text: string, hit: Hit): boolean {
  let before = text.slice(Math.max(0, hit.start - GUARD_WINDOW), hit.start);
  const sentenceBreak = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n'));
  if (sentenceBreak >= 0) before = before.slice(sentenceBreak + 1);
  return NEGATOR.test(before);
}

/** One entry per wording; dashes and case don't make a sentence different. */
const unique = (hits: Hit[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    const text = h.phrase.toLowerCase();
    const key = text.replace(/[\u2010-\u2015-]/g, '-');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(text);
    }
  }
  return out;
};

/** Drops hits that sit inside a longer hit, so one sentence gives one quote. */
function longestOnly(hits: Hit[]): Hit[] {
  return hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
}

export interface PhraseLists {
  extraPositive?: string[];
  extraNegative?: string[];
}

/** Bump when the rules change, so adverts read under old rules are re-read. */
const RULES_VERSION = 3;

const SPONSOR_WORD = /\bsponsor(?:s|ship|ing|ed)?\b/i;
/** Something in the sentence ties "sponsor" to work visas. */
const VISA_CONTEXT =
  /\b(visas?|immigration|skilled[\s-]worker|work permits?|relocat\w*|right to work|work authori[sz]ation|international (candidates|applicants)|candidates who need|sponsorship)\b/i;
/** "Sponsor" meaning events, sport or charity, not visas. */
const NOT_VISA = /\b(events?|hackathons?|conferences?|meetups?|charit(y|ies)|clubs?|sports?|tournaments?|sponsored by|title sponsor|sponsor(s|ed)? (a|the|our|local) (team|event|race))\b/i;
/** A question or condition: it asks about sponsorship rather than answering. */
const ASKS = /\?|\b(whether|do you|will you|are you|would you|if you|please (state|indicate|confirm|tell|let us know)|let us know if)\b/i;
const NEED = /\b(need|needs|needing|require|requires|requiring|required)\b/i;
const NEGATOR_WORD =
  /^(no|not|non|never|unable|cannot|can't|cant|won't|wont|don't|dont|doesn't|doesnt|isn't|isnt|aren't|arent|without|unfortunately|neither|nor)$/i;
const NEGATION_REACH = 7;

interface Sentence {
  text: string;
  start: number;
  end: number;
}

/** Splits on sentence ends, line breaks, bullets and emoji (LinkedIn adverts use them as bullets). */
function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n•▪●◦‣\p{Extended_Pictographic}]+[.!?]?/gu;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (trimmed.length < 4) continue;
    const start = (m.index ?? 0) + raw.indexOf(trimmed);
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

function quoteAround(sentence: string, index: number, max = 90): string {
  const flat = sentence.replace(/\s+/g, ' ');
  if (flat.length <= max) return flat.replace(/[.!?]$/, '');
  let from = Math.max(0, Math.min(index - 35, flat.length - max));
  let to = Math.min(flat.length, from + max);
  // Snap to whole words.
  if (from > 0) from = flat.indexOf(' ', from) + 1 || from;
  if (to < flat.length) to = flat.lastIndexOf(' ', to) > from ? flat.lastIndexOf(' ', to) : to;
  return `${from > 0 ? '…' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '…' : ''}`;
}

type SentenceVerdict = 'positive' | 'hard' | 'soft' | 'mention';

/** Reads one sentence that mentions sponsoring and that no listed phrase covered. */
function judgeSentence(sentence: string): { kind: SentenceVerdict; quote: string } | undefined {
  const m = SPONSOR_WORD.exec(sentence);
  if (!m || !VISA_CONTEXT.test(sentence)) return undefined;
  if (NOT_VISA.test(sentence) && !/\b(visas?|immigration|skilled[\s-]worker)\b/i.test(sentence)) return undefined;
  const quote = quoteAround(sentence, m.index);
  if (ASKS.test(sentence)) return { kind: 'mention', quote };

  const words = sentence.slice(0, m.index).split(/\s+/).filter(Boolean);
  const reach = words.slice(-NEGATION_REACH);
  const negAt = reach.findIndex((w) => NEGATOR_WORD.test(w.replace(/[^\w']/g, '')));
  if (negAt >= 0) {
    // "candidates who don't need sponsorship": a preference, not a refusal.
    return { kind: NEED.test(reach.slice(negAt).join(' ')) ? 'soft' : 'hard', quote };
  }
  return { kind: 'positive', quote };
}

export function classifyText(text: string, lists: PhraseLists = {}): TextSignals {
  const flat = text.replace(/[\u2018\u2019]/g, "'");
  const hard = find(flat, [...HARD_NEGATIVE, ...(lists.extraNegative ?? [])]);
  const soft = find(flat, SOFT_NEGATIVE);
  const positive: Hit[] = [];

  for (const hit of find(flat, [...POSITIVE, ...(lists.extraPositive ?? [])])) {
    const insideNegative = hard.some((n) => hit.start < n.end && hit.end > n.start);
    if (insideNegative) continue;
    if (negated(flat, hit)) {
      // "no visa sponsorship available", "unfortunately we cannot ... offer sponsorship"
      const from = Math.max(0, hit.start - GUARD_WINDOW);
      const negator = NEGATOR.exec(flat.slice(from, hit.start));
      const start = negator ? from + negator.index : hit.start;
      hard.push({ phrase: flat.slice(start, hit.end).replace(/\s+/g, ' ').trim(), start, end: hit.end });
    } else {
      positive.push(hit);
    }
  }

  // Sentences that talk about sponsoring in words no list has.
  const covered = [...hard, ...soft, ...positive];
  const mentions: string[] = [];
  for (const sentence of sentences(flat)) {
    if (covered.some((h) => h.start < sentence.end && h.end > sentence.start)) continue;
    const verdict = judgeSentence(sentence.text);
    if (!verdict) continue;
    const hit = { phrase: verdict.quote, start: sentence.start, end: sentence.end };
    if (verdict.kind === 'positive') positive.push(hit);
    else if (verdict.kind === 'hard') hard.push(hit);
    else if (verdict.kind === 'soft') soft.push(hit);
    else mentions.push(verdict.quote);
  }

  return {
    hardNegative: unique(longestOnly(hard)),
    softNegative: unique(longestOnly(soft)),
    positive: unique(longestOnly(positive)),
    mentions: [...new Set(mentions)],
  };
}

/** Changes whenever the phrase lists change, so cached signals can be dropped. */
export function phraseStamp(lists: PhraseLists): string {
  return JSON.stringify([RULES_VERSION, HARD_NEGATIVE.length, SOFT_NEGATIVE.length, POSITIVE.length, lists.extraPositive ?? [], lists.extraNegative ?? []]);
}
