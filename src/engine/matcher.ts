import { jaroWinkler } from './jaroWinkler';
import { ALIASES, brandCore, clean, domainsCompatible, normaliseName, splitTradingName, strictName } from './normalise';
import type { CompanyMatch } from './types';

const squashed = (key: string) => key.replace(/ /g, '');
const legalPart = (name: string) => splitTradingName(name).legal;

export const FUZZY_THRESHOLD = 0.92;
/** Fuzzy matching short names produces too many false matches. */
const FUZZY_MIN_LENGTH = 8;
const CLOSEST_THRESHOLD = 0.85;
const MAX_NAMES = 3;

/**
 * In-memory index over register names. Exact, trading-name and brand lookups
 * are map hits; fuzzy matching only scans names sharing a first letter.
 */
export class RegisterIndex {
  readonly names: string[];
  private readonly legal = new Map<string, number[]>();
  /** Legal names with spaces removed, so "ElevenLabs" finds "Eleven Labs Ltd". */
  private readonly joined = new Map<string, number[]>();
  private readonly exactName = new Map<string, number>();
  private readonly trading = new Map<string, number[]>();
  private readonly brand = new Map<string, number[]>();
  private readonly byInitial = new Map<string, Array<[string, number]>>();

  constructor(names: string[]) {
    this.names = names;
    names.forEach((name, i) => {
      this.exactName.set(name, i);
      const { legal, trading } = splitTradingName(name);
      const legalKey = normaliseName(legal);
      if (legalKey) {
        push(this.legal, legalKey, i);
        push(this.joined, squashed(legalKey), i);
        // Brand lookups use legal names only: a pub trading as "The Amazon" is not Amazon.
        const core = brandCore(legalKey);
        if (core) push(this.brand, core, i);
        this.bucket(legalKey, i);
      }
      if (trading) {
        const tradingKey = normaliseName(trading);
        if (tradingKey) {
          push(this.trading, tradingKey, i);
          this.bucket(tradingKey, i);
        }
      }
    });
  }

  private bucket(key: string, i: number): void {
    let bucket = this.byInitial.get(key[0]);
    if (!bucket) this.byInitial.set(key[0], (bucket = []));
    bucket.push([key, i]);
  }

  get size(): number {
    return this.names.length;
  }

  /**
   * Orders candidates best first: same strict name, then most words shared
   * with the company as written, then the shortest name.
   */
  private rank(company: string, indices: number[]): string[] {
    const strict = strictName(company);
    const words = new Set(clean(company));
    const scored = [...new Set(indices.map((i) => this.names[i]))].map((name) => {
      const legal = legalPart(name);
      const shared = clean(legal).filter((w) => words.has(w)).length;
      return { name, score: (strictName(legal) === strict ? 1000 : 0) + shared * 10 - legal.length / 100 };
    });
    // The register repeats some companies with different capitalisation; list each once.
    const seen = new Set<string>();
    return scored
      .sort((a, b) => b.score - a.score)
      .filter((c) => {
        const k = strictName(legalPart(c.name));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((c) => c.name);
  }

  /** Number of distinct companies among ranked (already de-duplicated) candidates. */
  private static distinct(names: string[]): number {
    return names.length;
  }

  match(company: string): CompanyMatch {
    const key = normaliseName(company);
    if (!key) return { licensed: false, registerNames: [], score: 0 };

    // Curated aliases first: they exist because the register name misleads.
    const alias = ALIASES[key];
    const aliased = alias === undefined ? undefined : this.exactName.get(alias);
    if (aliased !== undefined) return { licensed: true, kind: 'alias', registerNames: [this.names[aliased]], score: 1 };

    const core = brandCore(key);
    const brand = ((core ? this.brand.get(core) : undefined) ?? []).filter((i) => domainsCompatible(company, legalPart(this.names[i])));

    // Same name once suffixes are gone. Only a match that differs by pure
    // legal forms (Ltd, PLC, UK) counts as exact; "Man Group" vs
    // "Man Corporation Ltd" is only similar.
    const legal = this.legal.get(key) ?? this.joined.get(squashed(key));
    if (legal) {
      const ranked = this.rank(company, [...legal, ...brand]);
      const top = ranked[0];
      if (strictName(legalPart(top)) === strictName(company)) {
        return { licensed: true, kind: 'exact', registerNames: ranked.slice(0, MAX_NAMES), score: 1 };
      }
      return {
        licensed: true,
        kind: 'similar',
        registerNames: ranked.slice(0, MAX_NAMES),
        score: jaroWinkler(key, normaliseName(legalPart(top))),
        ambiguous: RegisterIndex.distinct(ranked) > 1,
      };
    }

    if (brand.length) {
      const ranked = this.rank(company, brand);
      return {
        licensed: true,
        kind: 'brand',
        registerNames: ranked.slice(0, MAX_NAMES),
        score: jaroWinkler(key, normaliseName(legalPart(ranked[0]))),
        ambiguous: RegisterIndex.distinct(ranked) > 1,
      };
    }

    const trading = this.trading.get(key);
    if (trading) {
      const ranked = this.rank(company, trading);
      return { licensed: true, kind: 'trading_name', registerNames: ranked.slice(0, MAX_NAMES), score: 1, ambiguous: RegisterIndex.distinct(ranked) > 1 };
    }

    // Fuzzy matching is for spelling slips only: one character added, removed
    // or changed. Looser than that and "Capital One" matches "Capital Com",
    // or "Mako Trading" matches "MAC Trading".
    let best = 0;
    let bestIndex = -1;
    let near = 0;
    let nearIndex = -1;
    if (key.length >= FUZZY_MIN_LENGTH && core !== undefined) {
      for (const [candidate, i] of this.byInitial.get(key[0]) ?? []) {
        if (candidate.length < FUZZY_MIN_LENGTH || Math.abs(candidate.length - key.length) > 6) continue;
        const score = jaroWinkler(key, candidate);
        if (score > near) {
          near = score;
          nearIndex = i;
        }
        if (score > best && score >= FUZZY_THRESHOLD && spellingSlip(key, candidate)) {
          best = score;
          bestIndex = i;
        }
      }
    }
    if (bestIndex >= 0) {
      return { licensed: true, kind: 'fuzzy', registerNames: [this.names[bestIndex]], score: best };
    }
    return {
      licensed: false,
      registerNames: [],
      score: near,
      closest: nearIndex >= 0 && near >= CLOSEST_THRESHOLD ? this.names[nearIndex] : undefined,
    };
  }

  /** Register names containing every word of the query, for the link-override picker. */
  search(query: string, limit = 8): string[] {
    const tokens = normaliseName(query).split(' ').filter(Boolean);
    if (tokens.length === 0) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    const scan = (startsWith: boolean) => {
      for (const name of this.names) {
        if (out.length >= limit) return;
        const key = normaliseName(name);
        const hit = startsWith ? key.startsWith(tokens.join(' ')) : tokens.every((t) => key.includes(t));
        if (hit && !seen.has(name)) {
          seen.add(name);
          out.push(name);
        }
      }
    };
    scan(true);
    scan(false);
    return out;
  }
}

/**
 * True when two names differ by one typo in one word of six letters or more.
 * A slip in a short word is usually a different company ("IMC" vs "IMK").
 */
export function spellingSlip(a: string, b: string): boolean {
  const wa = a.split(' ');
  const wb = b.split(' ');
  if (wa.length !== wb.length) return false;
  const differing = wa.map((w, i) => [w, wb[i]] as const).filter(([x, y]) => x !== y);
  if (differing.length !== 1) return false;
  const [x, y] = differing[0];
  return Math.min(x.length, y.length) >= 6 && withinOneEdit(x, y);
}

/** True when b can be made from a with at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
