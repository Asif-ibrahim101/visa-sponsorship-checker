import { checkSalary, formatMoney, formatSalary } from './salary';
import { STATUS_LABEL, type CompanyMatch, type Status, type Verdict, type VerdictInput } from './types';

const quote = (phrases: string[]) => phrases.slice(0, 2).map((p) => `"${p}"`).join(', ');

function matchLine(match: CompanyMatch): string {
  const top = match.registerNames[0] ?? '';
  switch (match.kind) {
    case 'override':
      return top ? `Licensed sponsor (${top}, linked by you)` : 'Marked by you as a sponsor';
    case 'exact':
      return `Licensed sponsor (${top})`;
    case 'similar':
      return `Likely licensed sponsor (${top}, similar name)`;
    case 'alias':
      return `Licensed sponsor (${top}, known alias)`;
    case 'trading_name':
      return `Licensed sponsor (${top}, trading name)`;
    case 'brand':
      return `Likely licensed sponsor (${top}, brand match)`;
    case 'fuzzy':
      return `Licensed sponsor (${top}, ${Math.round(match.score * 100)}% match)`;
    default:
      return 'Licensed sponsor';
  }
}

/**
 * Applies the verdict rules in order; the first that matches wins.
 *
 *  0  Your override for this job, or "doesn't sponsor" for the company
 *  1  Advert explicitly rules out sponsorship            -> No
 *  2  Posted by an agency                                -> Unknown / Possible / Unlikely
 *  3  Company not on the register                        -> Not licensed (Possible if advert offers sponsorship)
 *  4  Licensed, salary wholly below floor or role flag   -> Unlikely
 *  5  Licensed, advert offers sponsorship                -> Sponsors
 *  6  Licensed, advert only has right-to-work wording    -> Unlikely
 *  7  Licensed, salary range straddles the floor         -> Possible
 *  8  Licensed, advert silent                            -> Possible
 */
export function decide(input: VerdictInput): Verdict {
  const { company, match, text, salary, roleFlags, floor } = input;
  const provisional = text === undefined;
  const salaryCheck = checkSalary(salary, floor);
  const floorText = formatMoney(floor);

  const details: string[] = [];
  const licensed = match.licensed;
  const agency = input.isAgency && input.companyOverride === undefined;
  if (agency) details.push('Posted by an agency; real employer unknown.');
  else if (licensed) {
    details.push(`${matchLine(match)}.`);
    if (match.ambiguous) {
      const others = match.registerNames.slice(1).join('; ');
      details.push(`Several sponsors share this name${others ? ` (also ${others})` : ''}; check it's the right one.`);
    }
  }
  else details.push(`No sponsor licence found for ${company}${match.closest ? ` (closest: ${match.closest})` : ''}.`);

  if (salary) {
    const s = formatSalary(salary);
    if (salaryCheck === 'meets') details.push(`Salary ${s} meets the ${floorText} floor.`);
    if (salaryCheck === 'below') details.push(`Salary ${s} is below the ${floorText} floor.`);
    if (salaryCheck === 'straddles') details.push(`Salary range ${s} straddles the ${floorText} floor.`);
  } else {
    details.push('No salary shown.');
  }

  if (provisional) details.push('Open the job to check the advert text.');
  else if (text.hardNegative.length) details.push(`Advert says: ${quote(text.hardNegative)}.`);
  else if (text.positive.length && text.softNegative.length) details.push(`Advert says ${quote(text.positive)} but also ${quote(text.softNegative)}.`);
  else if (text.positive.length) details.push(`Advert says: ${quote(text.positive)}.`);
  else if (text.softNegative.length) details.push(`Advert says: ${quote(text.softNegative)}.`);
  else if (text.mentions.length) details.push(`Advert mentions sponsorship without saying either way: ${quote(text.mentions)}.`);
  else details.push('Advert silent on visas.');

  if (text?.hardNegative.length && text.positive.length) details.push(`It also says ${quote(text.positive)}; the "no" wins.`);

  const uncertainMatch = licensed && !agency && match.ambiguous === true && match.kind !== 'override';
  const out = (status: Status, rule: string, reason: string): Verdict => ({ status, rule, reason, details, provisional, uncertainMatch });

  if (input.jobOverride) return out(input.jobOverride, 'job_override', `You marked this job as ${STATUS_LABEL[input.jobOverride]}`);
  if (input.companyOverride?.kind === 'no') return out('no', 'company_override', `You marked ${company} as doesn't sponsor`);

  if (text?.hardNegative.length) return out('no', 'explicit_no', `Says: ${text.hardNegative[0]}`);

  if (agency) {
    if (text?.positive.length) return out('possible', 'agency_positive', 'Agency post; advert offers sponsorship');
    if (text?.softNegative.length) return out('unlikely', 'agency_right_to_work', `Agency post; says: ${text.softNegative[0]}`);
    return out('unknown', 'agency', 'Posted by an agency; real employer unknown');
  }

  if (!licensed) {
    if (text?.positive.length) return out('possible', 'unlicensed_positive', `Advert offers sponsorship, but no licence found for ${company}`);
    return out('not_licensed', 'not_licensed', `No sponsor licence found for ${company}`);
  }

  if (salary && salaryCheck === 'below') return out('unlikely', 'salary_below', `Salary ${formatSalary(salary)} is below the ${floorText} floor`);
  if (roleFlags.length) return out('unlikely', 'role_level', `Role rarely qualifies: ${roleFlags.join(', ')}`);

  if (text?.positive.length) return out('sponsors', 'licensed_positive', 'Licensed sponsor; advert offers sponsorship');
  if (text?.softNegative.length) return out('unlikely', 'right_to_work', `Licensed sponsor, but says: ${text.softNegative[0]}`);
  if (salaryCheck === 'straddles') return out('possible', 'salary_straddles', 'Licensed sponsor; salary range straddles the floor');
  if (provisional) return out('possible', 'licensed_unread', 'Licensed sponsor; advert not read yet');
  if (text.mentions.length) return out('possible', 'licensed_mentions', 'Licensed sponsor; advert raises sponsorship but is unclear');
  return out('possible', 'licensed_silent', "Licensed sponsor; advert doesn't mention visas");
}
