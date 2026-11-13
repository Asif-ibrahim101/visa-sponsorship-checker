/** Checked against the job title only; these words are too common in body text. */
const TITLE_FLAGS: Array<[RegExp, string]> = [
  [/\bapprentice(ship)?s?\b/i, 'apprenticeship'],
  [/\bIT support\b/i, 'IT support role'],
  [/\b(help\s?desk|service\s?desk|desktop support|1st line|first line|2nd line|second line)\b/i, 'helpdesk role'],
];

/** Checked against the title and the employment-type line. */
const META_FLAGS: Array<[RegExp, string]> = [[/\bpart[\s-]?time\b/i, 'part-time']];

/** Checked against title, employment type and description. */
const ANYWHERE_FLAGS: Array<[RegExp, string]> = [[/\binside\s+IR35\b/i, 'inside IR35']];

const SHORT_CONTRACT = [
  /\b(\d{1,2})[\s-]?(?:months?|mths?)\s+(?:fixed[\s-]term|contract|ftc|initial contract)\b/i,
  /\b(?:fixed[\s-]term|contract|ftc)\b[^.\n]{0,40}?\b(\d{1,2})[\s-]?(?:months?|mths?)\b/i,
];

export interface RoleInput {
  title: string;
  /** Employment-type line, e.g. "Full-time · Contract". */
  meta?: string;
  description?: string;
}

/** Reasons the role is unlikely to qualify for Skilled Worker sponsorship. */
export function roleFlags({ title, meta = '', description = '' }: RoleInput): string[] {
  const flags = new Set<string>();
  for (const [re, label] of TITLE_FLAGS) if (re.test(title)) flags.add(label);
  for (const [re, label] of META_FLAGS) if (re.test(title) || re.test(meta)) flags.add(label);
  for (const [re, label] of ANYWHERE_FLAGS) if (re.test(title) || re.test(meta) || re.test(description)) flags.add(label);

  for (const source of [title, meta, description]) {
    for (const re of SHORT_CONTRACT) {
      const m = re.exec(source);
      if (m && Number(m[1]) > 0 && Number(m[1]) < 12) {
        flags.add(`${Number(m[1])}-month contract`);
        break;
      }
    }
  }
  return [...flags];
}
