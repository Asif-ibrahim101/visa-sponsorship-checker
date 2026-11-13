/** Legal-form and filler tokens dropped from the end of a company name. */
const SUFFIXES = new Set([
  'ltd', 'limited', 'plc', 'llp', 'lp', 'inc', 'incorporated', 'corp', 'corporation',
  'uk', 'group', 'holdings', 'holding', 'co', 'company', 'cic', 'gmbh', 'sa', 'ag', 'bv', 'llc', 'com',
  'spa', 'srl', 'sarl', 'sas', 'nv', 'oy', 'as', 'aps', 'branch',
]);

/**
 * Descriptor words that often separate a brand ("Monzo") from its legal
 * entity ("Monzo Bank Ltd"). Deliberately excludes place names.
 */
const GENERIC = new Set([
  'bank', 'banking', 'services', 'service', 'technology', 'technologies', 'tech', 'software',
  'solutions', 'systems', 'digital', 'labs', 'lab', 'international', 'global', 'europe', 'emea',
  'financial', 'finance', 'payments', 'capital', 'markets', 'consulting', 'consultancy',
  'management', 'partners', 'ventures', 'trading', 'operations', 'worldwide', 'enterprises',
  'information', 'platform', 'online', 'retail', 'stores', 'central', 'resources', 'market',
  'asset', 'investments', 'securities', 'ai', 'ab', 'branch', 'and', 'the', 'of',
]);

const TRADING_AS = /\s+(?:t\/a|t\/as|trading as|t\.a\.)\s+/i;

/** Pure legal forms. Names that differ only by these are the same name. */
const LEGAL_FORMS = new Set([
  'ltd', 'limited', 'plc', 'llp', 'lp', 'inc', 'incorporated', 'llc', 'gmbh', 'sa', 'ag', 'bv', 'cic', 'uk',
  'spa', 'srl', 'sarl', 'sas', 'nv', 'oy', 'as', 'aps', 'branch',
]);

export function clean(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    // Dotted initials as one word: "S.P.A." -> "spa", "N.V." -> "nv", "J.P." -> "jp".
    .replace(/\b(?:[a-z]\.){2,}/g, (m) => ` ${m.replace(/\./g, '')} `)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function stripTrailing(tokens: string[], drop: Set<string>): string[] {
  const out = [...tokens];
  for (;;) {
    const n = out.length;
    if (n > 2 && out[n - 2] === 'united' && out[n - 1] === 'kingdom') out.splice(n - 2, 2);
    else if (n > 1 && (drop.has(out[n - 1]) || out[n - 1] === 'and')) out.pop();
    else break;
  }
  if (out.length > 1 && out[0] === 'the') out.shift();
  return out;
}

function stripSuffixes(tokens: string[]): string[] {
  return stripTrailing(tokens, SUFFIXES);
}

/**
 * Stricter than normaliseName: only pure legal forms are removed, so
 * "Man Group" and "Man Corporation Ltd" stay different. Spaces are dropped
 * so "ElevenLabs" equals "Eleven Labs Ltd".
 */
export function strictName(name: string): string {
  return stripTrailing(clean(name), LEGAL_FORMS).join('');
}

/** Lowercase, strip punctuation and trailing legal suffixes. */
export function normaliseName(name: string): string {
  return stripSuffixes(clean(name)).join(' ');
}

/**
 * Splits "Foo Ltd T/A Bar" into the legal name and the trading name.
 * The register has no trading-name column; it is embedded in the name.
 */
export function splitTradingName(name: string): { legal: string; trading?: string } {
  const parts = name.split(TRADING_AS);
  if (parts.length < 2) return { legal: name.trim() };
  return { legal: parts[0].trim(), trading: parts.slice(1).join(' ').trim() || undefined };
}

/**
 * The brand part of a normalised name: trailing descriptor words removed.
 * Returns undefined when the name is nothing but descriptors, because such
 * a core ("digital", "global") would match unrelated companies.
 */
export function brandCore(normalised: string): string | undefined {
  const tokens = normalised.split(' ').filter(Boolean);
  while (tokens.length > 1 && (GENERIC.has(tokens[tokens.length - 1]) || SUFFIXES.has(tokens[tokens.length - 1]))) {
    tokens.pop();
  }
  if (tokens.length === 0 || tokens.every((t) => GENERIC.has(t))) return undefined;
  return tokens.join(' ');
}

/**
 * Brands whose UK register entry has an unrelated or hard-to-match name.
 * Each target was checked against the register on 2026-11-10; an alias whose
 * target has since left the register is ignored by the matcher.
 */
const ALIAS_LIST: Array<[string[], string]> = [
  [['Meta', 'Facebook'], 'Facebook UK'],
  [['PwC', 'PwC UK'], 'PricewaterhouseCoopers LLP'],
  [['BBC'], 'British Broadcasting Corporation'],
  [['EY'], 'Ernst & Young'],
  [['JPMorgan Chase', 'JPMorganChase', 'J.P. Morgan', 'JPMorgan', 'JP Morgan'], 'JPMorgan Chase Bank, National Association'],
  [['Just Eat', 'Just Eat Takeaway.com'], 'Just Eat Holding Limited'],
  [['QuantumBlack', 'QuantumBlack, AI by McKinsey'], 'McKinsey & Company Inc. United Kingdom'],
  [['Mako', 'Mako Trading', 'Mako Group'], 'Mako Global Derivatives Partnership LLP'],
  [['Citadel'], 'Citadel Enterprise Europe Limited'],
  [['Admiral', 'Admiral Group', 'Admiral Group plc'], 'Eui Limited'],
  [['Bank of America', 'BofA', 'BofA Securities'], 'Bank of America, N.A.'],
  [['Deutsche Bank'], 'DB Group Services (UK) Ltd'],
  [['XTX Markets', 'XTX'], 'XTX Research LLP'],
  [['Man Group', 'Man AHL'], 'Man Group Services Limited'],
  [['Schroders'], 'Schroder Investment Management Limited'],
  [['BlackRock'], 'BlackRock Investment Management (UK) Limited'],
  [['LSEG', 'London Stock Exchange Group', 'Refinitiv', 'LSEG Data & Analytics'], 'London Stock Exchange Group plc'],
  [["Moody's", "Moody's Corporation"], "Moody's Analytics UK Ltd"],
  [['Moneybox'], 'Digital Moneybox Limited'],
  [['Plum'], 'Plum Fintech'],
  [['Adyen'], 'ADYEN N.V. LONDON BRANCH'],
  [['ClearScore'], 'Clear Score Technology Limited'],
  [['ComplyAdvantage'], 'IVXS UK Limited'],
  [['Snowflake'], 'Snowflake Computing U.K. Limited'],
  [['Elastic'], 'Elasticsearch Limited'],
  [['Uber'], 'Uber London Limited'],
  [["Sainsbury's"], 'J Sainsbury Plc'],
  [['Channel 4'], 'CHANNEL 4 TELEVISION CORPORATION'],
  [['HCLTech', 'HCL Technologies'], 'HCL Technologies UK Limited'],
  [['Bought By Many', 'ManyPets'], 'ManyPets Ltd'],
  [['Hiscox'], 'HISCOX UNDERWRITING GROUP SERVICES LIMITED'],
  [['Stripe'], 'Stripe Payments UK Ltd'],
  [['Wise'], 'Wise Payments Limited'],
  [['Primer'], 'Primer API Limited'],
  [['Cera'], 'Cera Care Limited'],
  [['Huma'], 'HUMA THERAPEUTICS LIMITED'],
  [['LexisNexis', 'LexisNexis Risk Solutions', 'LexisNexis Legal & Professional', 'Elsevier', 'RELX'], 'RELX (UK) Limited'],
];

/** Normalised brand name -> register name. */
export const ALIASES: Record<string, string> = Object.fromEntries(
  ALIAS_LIST.flatMap(([brands, target]) => brands.map((b) => [normaliseName(b), target] as const)),
);

/**
 * Words that say what line of business a company is in. A brand match is
 * rejected when both names have such words and none agree, so "Deutsche Bank"
 * doesn't match "Deutsche Finance" and "IMC Trading" doesn't match "IMC Systems".
 */
const DOMAIN: Record<string, string> = {
  bank: 'bank', banking: 'bank', bancorp: 'bank',
  technology: 'tech', technologies: 'tech', tech: 'tech', software: 'tech', systems: 'tech', digital: 'tech',
  labs: 'tech', lab: 'tech', ai: 'tech', computing: 'tech', data: 'tech',
  trading: 'markets', markets: 'markets', market: 'markets', securities: 'markets', capital: 'markets',
  asset: 'markets', investments: 'markets', investment: 'markets', derivatives: 'markets',
  financial: 'finance', finance: 'finance', payments: 'finance', fintech: 'finance', credit: 'finance',
  consulting: 'consulting', consultancy: 'consulting', consultants: 'consulting', advisory: 'consulting',
  insurance: 'insurance', underwriting: 'insurance',
};

export function domainsCompatible(a: string, b: string): boolean {
  const da = new Set(clean(a).map((w) => DOMAIN[w]).filter(Boolean));
  const db = new Set(clean(b).map((w) => DOMAIN[w]).filter(Boolean));
  if (da.size === 0 || db.size === 0) return true;
  return [...da].some((d) => db.has(d));
}

const AGENCY_WORDS =
  /\b(recruitment|recruiting|recruiters?|resourcing|talent|staffing|headhunters?|jobs via|executive search|search (?:limited|ltd|partners|group))\b/i;

/** Normalised names of common UK tech and finance recruiters. */
const AGENCY_LIST = new Set([
  'hays', 'reed', 'reed technology', 'michael page', 'page', 'robert walters', 'robert half',
  'harnham', 'oliver bernard', 'la fosse', 'client server', 'hunter bond', 'nigel frank international',
  'jefferson frank', 'mason frank international', 'tenth revolution', 'x4 technology', 'salt',
  'austin fraser', 'noir', 'burns sheehan', 'explore', 'spectrum it', 'lorien', 'harvey nash',
  'adecco', 'randstad', 'manpower', 'experis', 'opus', 'understanding', 'haystack', 'hirist',
  'efinancialcareers', 'cv library', 'cubiq', 'oho', 'e frontiers', 'ic resources', 'pertemps',
  'huxley', 'computer futures', 'sthree', 'xcede', 'trust in soda', 'gravitas', 'venturi',
  'ventula consulting', 'mcgregor boyall', 'eames consulting', 'selby jennings', 'phaidon international',
  'dare', 'few and far', 'radley james', 'harrington starr', 'aurum search', 'movemeon', 'otta', 'jobster', 'jobgether', 'lumenalta', 'crossover',
]);

export function isAgency(company: string): boolean {
  if (AGENCY_WORDS.test(company)) return true;
  return AGENCY_LIST.has(normaliseName(company));
}
