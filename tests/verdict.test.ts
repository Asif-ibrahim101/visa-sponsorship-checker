import { describe, expect, it } from 'vitest';
import { judge, type DescriptionSignals, type JobFacts } from '../src/engine/judge';
import { classifyText } from '../src/engine/phrases';
import { DEFAULT_SETTINGS, EMPTY_OVERRIDES, type CompanyMatch, type Overrides, type Settings } from '../src/engine/types';

const LICENSED: CompanyMatch = { licensed: true, kind: 'exact', registerNames: ['Acme Ltd'], score: 1 };
const UNLICENSED: CompanyMatch = { licensed: false, registerNames: [], score: 0 };

const job = (over: Partial<JobFacts> = {}): JobFacts => ({ jobId: '1', title: 'Software Engineer', company: 'Acme', ...over });
const advert = (text: string): DescriptionSignals => ({ text: classifyText(text), roleFlags: [] });
const SILENT = advert('Build great software with us.');

function run(opts: { job?: Partial<JobFacts>; match?: CompanyMatch; advert?: DescriptionSignals; settings?: Partial<Settings>; overrides?: Overrides }) {
  return judge(job(opts.job), opts.match ?? LICENSED, opts.advert, { ...DEFAULT_SETTINGS, ...opts.settings }, opts.overrides ?? EMPTY_OVERRIDES);
}

describe('verdict rules, in order', () => {
  it('1. advert explicitly rules out sponsorship -> No, even for a licensed sponsor', () => {
    const v = run({ advert: advert('We are unable to offer visa sponsorship.'), job: { salaryText: '£60k' } });
    expect(v).toMatchObject({ status: 'no', rule: 'explicit_no', reason: 'Says: unable to offer visa sponsorship' });
  });

  it('1. a "no" beats a "yes" in the same advert, and both are quoted', () => {
    const v = run({ advert: advert('Visa sponsorship available.\nWe cannot sponsor contractors.') });
    expect(v.status).toBe('no');
    expect(v.details.join(' ')).toContain('cannot sponsor');
    expect(v.details.join(' ')).toContain('visa sponsorship available');
  });

  it('2. agency post, advert silent -> Unknown employer', () => {
    const v = run({ job: { company: 'Oliver Bernard' }, match: LICENSED, advert: SILENT });
    expect(v).toMatchObject({ status: 'unknown', rule: 'agency' });
  });

  it('2. agency post still gets No when the advert rules sponsorship out', () => {
    expect(run({ job: { company: 'Acme Recruitment' }, advert: advert('No sponsorship.') }).status).toBe('no');
  });

  it('2. agency post offering sponsorship -> Possible', () => {
    expect(run({ job: { company: 'Acme Recruitment' }, match: UNLICENSED, advert: advert('Visa sponsorship available.') })).toMatchObject({
      status: 'possible',
      rule: 'agency_positive',
    });
  });

  it('3. company not on the register -> Not licensed', () => {
    const v = run({ match: { ...UNLICENSED, closest: 'Acme Holdings Ltd' }, advert: SILENT });
    expect(v).toMatchObject({ status: 'not_licensed', reason: 'No sponsor licence found for Acme' });
    expect(v.details[0]).toContain('closest: Acme Holdings Ltd');
  });

  it('3. not on the register but advert offers sponsorship -> Possible, not greyed out', () => {
    expect(run({ match: UNLICENSED, advert: advert('We sponsor visas.') })).toMatchObject({ status: 'possible', rule: 'unlicensed_positive' });
  });

  it('4. licensed, salary below the floor -> Unlikely', () => {
    const v = run({ job: { salaryText: '£28,000' }, advert: SILENT });
    expect(v).toMatchObject({ status: 'unlikely', reason: 'Salary £28k is below the £33.4k floor' });
  });

  it('4. a below-floor salary beats an advert that offers sponsorship', () => {
    expect(run({ job: { salaryText: '£28k' }, advert: advert('Visa sponsorship available.') }).status).toBe('unlikely');
  });

  it('4. licensed, role below degree level -> Unlikely', () => {
    const v = run({ job: { title: 'IT Support Apprentice' }, advert: SILENT });
    expect(v.status).toBe('unlikely');
    expect(v.reason).toContain('apprenticeship');
  });

  it('4. contract flags found in the description count', () => {
    const v = run({ advert: { ...SILENT, roleFlags: ['inside IR35'] } });
    expect(v).toMatchObject({ status: 'unlikely', rule: 'role_level' });
  });

  it('5. licensed and advert offers sponsorship -> Sponsors', () => {
    const v = run({ job: { salaryText: '£40k' }, advert: advert('Visa sponsorship available.') });
    expect(v).toMatchObject({ status: 'sponsors', reason: 'Licensed sponsor; advert offers sponsorship', provisional: false });
  });

  it('5. an explicit offer outweighs right-to-work boilerplate', () => {
    expect(run({ advert: advert('You must have the right to work in the UK. We can sponsor visas.') }).status).toBe('sponsors');
  });

  it('6. licensed, advert only has right-to-work wording -> Unlikely, not No', () => {
    expect(run({ advert: advert('You must have the right to work in the UK.') })).toMatchObject({ status: 'unlikely', rule: 'right_to_work' });
  });

  it('7. licensed, salary range straddles the floor -> Possible', () => {
    expect(run({ job: { salaryText: '£30k–£40k' }, advert: SILENT })).toMatchObject({ status: 'possible', rule: 'salary_straddles' });
  });

  it('8. licensed, advert silent, salary meets the floor -> Possible', () => {
    const v = run({ job: { salaryText: '£35k' }, advert: SILENT });
    expect(v).toMatchObject({ status: 'possible', reason: "Licensed sponsor; advert doesn't mention visas" });
    expect(v.details).toEqual(['Licensed sponsor (Acme Ltd).', 'Salary £35k meets the £33.4k floor.', 'Advert silent on visas.']);
  });

  it('8. licensed, advert raises sponsorship without settling it -> Possible, quoting it', () => {
    const v = run({ advert: advert('Please state whether you require visa sponsorship.') });
    expect(v).toMatchObject({ status: 'possible', rule: 'licensed_mentions' });
    expect(v.details.join(' ')).toContain('whether you require visa sponsorship');
  });

  it('3. unlicensed company whose advert says "we sponsor work visas" -> Possible', () => {
    expect(run({ match: UNLICENSED, advert: advert('We sponsor work visas and handle the process.') }).status).toBe('possible');
  });

  it('8. licensed, advert silent, no salary shown -> Possible (salary check skipped)', () => {
    expect(run({ advert: SILENT }).status).toBe('possible');
  });
});

describe('before the advert has been read', () => {
  it('judges on company and salary only and says so', () => {
    const v = run({ job: { salaryText: '£35k' } });
    expect(v).toMatchObject({ status: 'possible', provisional: true, rule: 'licensed_unread' });
    expect(v.details).toContain('Open the job to check the advert text.');
  });

  it('upgrades once the advert is known', () => {
    expect(run({}).status).toBe('possible');
    expect(run({ advert: advert('Sponsorship provided.') }).status).toBe('sponsors');
    expect(run({ advert: advert('No sponsorship.') }).status).toBe('no');
  });

  it('uses a salary found in the description when the card shows none', () => {
    const v = run({ advert: { ...SILENT, salary: { min: 26000, max: 26000, raw: '£26,000' } } });
    expect(v.status).toBe('unlikely');
  });
});

describe('settings', () => {
  it('uses the general floor when selected', () => {
    expect(run({ job: { salaryText: '£38k' }, advert: SILENT }).status).toBe('possible');
    const v = run({ job: { salaryText: '£38k' }, advert: SILENT, settings: { floorMode: 'general' } });
    expect(v).toMatchObject({ status: 'unlikely', reason: 'Salary £38k is below the £41.7k floor' });
  });

  it('uses a custom floor when selected', () => {
    expect(run({ job: { salaryText: '£38k' }, advert: SILENT, settings: { floorMode: 'custom', customFloor: 39000 } }).status).toBe('unlikely');
  });
});

describe('match wording in the hover reason', () => {
  it('shows the matched register name and how it matched', () => {
    const fuzzy = run({ match: { licensed: true, kind: 'fuzzy', registerNames: ['Barclays Bank UK PLC'], score: 0.958 }, advert: SILENT });
    expect(fuzzy.details[0]).toBe('Licensed sponsor (Barclays Bank UK PLC, 96% match).');
    const brand = run({ match: { licensed: true, kind: 'brand', registerNames: ['Monzo Bank Ltd'], score: 0.9 }, advert: SILENT });
    expect(brand.details[0]).toBe('Likely licensed sponsor (Monzo Bank Ltd, brand match).');
    expect(brand.uncertainMatch).toBe(false);
  });

  it('marks an ambiguous match for checking and names the alternatives', () => {
    const v = run({ match: { licensed: true, kind: 'brand', registerNames: ['Atlas Market Ltd', 'Atlas Technology Ltd'], score: 0.88, ambiguous: true }, advert: SILENT });
    expect(v.uncertainMatch).toBe(true);
    expect(v.details[1]).toBe("Several sponsors share this name (also Atlas Technology Ltd); check it's the right one.");
  });

  it('does not mark a match you linked yourself', () => {
    const v = run({
      match: { licensed: true, kind: 'brand', registerNames: ['Atlas Market Ltd'], score: 0.88, ambiguous: true },
      advert: SILENT,
      overrides: { companies: { acme: { kind: 'link', registerName: 'Atlas Market Ltd' } }, jobs: {} },
    });
    expect(v.uncertainMatch).toBe(false);
  });
});

describe('entry level', () => {
  it('is added alongside the sponsorship verdict', () => {
    expect(run({ job: { title: 'Graduate Software Engineer' }, advert: SILENT }).entryLevel).toBe('Title says "Graduate"');
    expect(run({ advert: SILENT }).entryLevel).toBeUndefined();
    expect(run({ advert: { ...SILENT, experience: { minYears: 1, yearsText: '1+ years of experience' } } }).entryLevel).toBe('Advert asks for 1+ years of experience');
  });
});

describe('outside the UK', () => {
  it('keeps the verdict and adds a note', () => {
    const v = run({ job: { location: 'Dublin, Ireland' }, advert: SILENT });
    expect(v).toMatchObject({ status: 'possible', outsideUk: 'Dublin, Ireland' });
    expect(v.details.at(-1)).toBe('Based in Dublin, Ireland, outside the UK; the UK sponsor licence is shown for reference.');
    expect(run({ job: { location: 'London' }, advert: SILENT }).outsideUk).toBeUndefined();
  });
});

describe('overrides', () => {
  it('"company sponsors" makes an unlisted company count as licensed', () => {
    const v = run({ match: UNLICENSED, advert: SILENT, overrides: { companies: { acme: { kind: 'sponsors' } }, jobs: {} } });
    expect(v.status).toBe('possible');
    expect(v.details[0]).toBe('Marked by you as a sponsor.');
  });

  it('"company doesn\'t sponsor" forces No', () => {
    const v = run({ advert: advert('Visa sponsorship available.'), overrides: { companies: { acme: { kind: 'no' } }, jobs: {} } });
    expect(v).toMatchObject({ status: 'no', rule: 'company_override' });
  });

  it('a linked register entry counts as licensed and is named', () => {
    const v = run({ match: UNLICENSED, advert: SILENT, overrides: { companies: { acme: { kind: 'link', registerName: 'Acme Trading Co Ltd' } }, jobs: {} } });
    expect(v.status).toBe('possible');
    expect(v.details[0]).toContain('Acme Trading Co Ltd, linked by you');
  });

  it('a company override lifts an agency out of Unknown', () => {
    const v = run({ job: { company: 'Acme Talent' }, advert: SILENT, overrides: { companies: { 'acme talent': { kind: 'sponsors' } }, jobs: {} } });
    expect(v.status).toBe('possible');
  });

  it('a job override beats everything', () => {
    const v = run({ advert: advert('No sponsorship.'), overrides: { companies: {}, jobs: { '1': 'sponsors' } } });
    expect(v).toMatchObject({ status: 'sponsors', rule: 'job_override' });
  });
});
