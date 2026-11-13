export type Status = 'sponsors' | 'possible' | 'unlikely' | 'no' | 'not_licensed' | 'unknown';

export const STATUS_LABEL: Record<Status, string> = {
  sponsors: 'Sponsors',
  possible: 'Possible',
  unlikely: 'Unlikely',
  no: 'No',
  not_licensed: 'Not licensed',
  unknown: 'Unknown employer',
};

/** Statuses that are dimmed and hidden by the hide toggle. */
export const FADED: ReadonlySet<Status> = new Set<Status>(['no', 'not_licensed']);

export type FloorMode = 'new_entrant' | 'general' | 'custom';

export interface Settings {
  floorMode: FloorMode;
  newEntrantFloor: number;
  generalFloor: number;
  customFloor: number;
  extraPositive: string[];
  extraNegative: string[];
  dimming: boolean;
  /** Hide jobs posted by recruitment agencies (status Unknown employer). */
  hideAgency: boolean;
  opacity: number;
  hide: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  floorMode: 'new_entrant',
  newEntrantFloor: 33400,
  generalFloor: 41700,
  customFloor: 33400,
  extraPositive: [],
  extraNegative: [],
  dimming: true,
  hideAgency: true,
  opacity: 0.4,
  hide: false,
};

export function activeFloor(s: Settings): number {
  if (s.floorMode === 'general') return s.generalFloor;
  if (s.floorMode === 'custom') return s.customFloor;
  return s.newEntrantFloor;
}

export type MatchKind = 'exact' | 'similar' | 'alias' | 'trading_name' | 'brand' | 'fuzzy' | 'override';

export interface CompanyMatch {
  licensed: boolean;
  kind?: MatchKind;
  /** Register name(s) that matched, original spelling. */
  registerNames: string[];
  /** 0..1 similarity between the normalised names. */
  score: number;
  /** Several unrelated sponsors fit the name; the first may be the wrong one. */
  ambiguous?: boolean;
  /** Nearest register name when nothing matched, to help spot a near miss. */
  closest?: string;
}

export interface Salary {
  /** Annualised lower bound in pounds. */
  min: number;
  /** Annualised upper bound in pounds (same as min when not a range). */
  max: number;
  /** The text that was parsed. */
  raw: string;
}

export interface TextSignals {
  /** Phrases that explicitly rule out sponsorship. */
  hardNegative: string[];
  /** Boilerplate-ish phrases such as "must have the right to work in the UK". */
  softNegative: string[];
  positive: string[];
  /** Sentences that raise sponsorship without settling it, e.g. a question. */
  mentions: string[];
}

export type CompanyOverride =
  | { kind: 'sponsors' }
  | { kind: 'no' }
  | { kind: 'link'; registerName: string };

export interface Overrides {
  /** Keyed by normalised company name. */
  companies: Record<string, CompanyOverride>;
  /** Keyed by LinkedIn job ID. */
  jobs: Record<string, Status>;
}

export const EMPTY_OVERRIDES: Overrides = { companies: {}, jobs: {} };

export interface VerdictInput {
  company: string;
  match: CompanyMatch;
  isAgency: boolean;
  /** Undefined until the job description has been read. */
  text?: TextSignals;
  salary?: Salary;
  roleFlags: string[];
  floor: number;
  companyOverride?: CompanyOverride;
  jobOverride?: Status;
}

export interface Verdict {
  status: Status;
  /** Short reason for the rule that decided the status. */
  reason: string;
  /** Extra context lines for the hover (match, salary, advert). */
  details: string[];
  /** True when the advert text hasn't been read yet. */
  provisional: boolean;
  /** True when the register match should be checked by eye. */
  uncertainMatch: boolean;
  /** Why the job counts as entry level; unset when it doesn't. */
  entryLevel?: string;
  /** The job's location when it is outside the UK. */
  outsideUk?: string;
  /** Which rule decided it, for tests and debugging. */
  rule: string;
}
