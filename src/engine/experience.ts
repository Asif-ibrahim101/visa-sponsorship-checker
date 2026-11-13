/** What the advert says about experience; cached per job with the other signals. */
export interface ExperienceSignals {
  /** The most demanding minimum found, e.g. 3 for "3+ years of experience". */
  minYears?: number;
  /** The wording that set minYears, for the hover. */
  yearsText?: string;
  /** Wording that marks the role as for beginners, e.g. "recent graduates". */
  entryPhrase?: string;
}

const MAX_PLAUSIBLE_YEARS = 15;

/**
 * "3+ years of experience", "0-2 years' commercial experience",
 * "at least 5 years experience", "minimum of 2 years of hands-on experience".
 */
const YEARS =
  /\b(?:at least |minimum (?:of )?|min\.? )?(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*)?years?(?:'|’)?\s+(?:of\s+)?(?:[\w-]+\s+){0,4}?(?:experience|exp)\b/gi;

const ENTRY_PHRASE =
  /\b(recent graduates?|new grads?|graduates? (?:are )?welcome|entry[\s-]level|early[\s-]careers?|graduate (?:scheme|programme|program|role|position|opportunity)|no (?:prior |previous |professional |commercial )?experience (?:is )?(?:required|necessary|needed)|your first (?:role|job) in)\b/i;

export function readExperience(description: string): ExperienceSignals {
  const out: ExperienceSignals = {};
  for (const m of description.matchAll(YEARS)) {
    const min = Number(m[1]);
    if (min > MAX_PLAUSIBLE_YEARS) continue;
    if (out.minYears === undefined || min > out.minYears) {
      out.minYears = min;
      out.yearsText = m[0].replace(/\s+/g, ' ').trim();
    }
  }
  const entry = ENTRY_PHRASE.exec(description);
  if (entry) out.entryPhrase = entry[0].toLowerCase();
  return out;
}

const SENIOR_TITLE =
  /\b(senior|snr|sr|lead|principal|staff|head of|director|vp|vice president|chief|(?:engineer|developer|scientist) (?:ii|iii|iv|v|2|3|4))\b/i;
/** Internships and apprenticeships are a different kind of job, so they get no badge. */
const NOT_A_GRAD_JOB = /\b(intern|internship|apprentice|apprenticeship|placement|summer)\b/i;
const ENTRY_TITLE =
  /\b(graduate|grad|new grad|junior|jnr|jr|entry[\s-]?level|early[\s-]?careers?|trainee|associate (?:software|engineer|developer|data)|(?:engineer|developer|scientist) (?:i|1))\b/i;

/**
 * A minimum above this rules a job out: "0-2 years" and "1+ years" are open
 * to a new graduate, "2+ years" is not.
 */
const ENTRY_MAX_YEARS = 1;

/**
 * Whether a job is entry level, and why. The title decides first; once the
 * advert has been read, a demand for 3+ years overrules it.
 */
export function entryLevel(title: string, described?: ExperienceSignals): string | undefined {
  if (SENIOR_TITLE.test(title) || NOT_A_GRAD_JOB.test(title)) return undefined;
  if (described?.minYears !== undefined && described.minYears > ENTRY_MAX_YEARS) return undefined;

  const word = ENTRY_TITLE.exec(title);
  if (word) return `Title says "${word[0]}"`;
  if (described?.entryPhrase) return `Advert says "${described.entryPhrase}"`;
  if (described?.minYears !== undefined) return `Advert asks for ${described.yearsText ?? `${described.minYears} years`}`;
  return undefined;
}
