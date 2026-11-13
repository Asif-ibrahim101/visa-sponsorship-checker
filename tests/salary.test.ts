import { describe, expect, it } from 'vitest';
import { checkSalary, formatSalary, parseSalary } from '../src/engine/salary';

describe('parseSalary', () => {
  it.each([
    ['£35,000', 35000, 35000],
    ['£35k', 35000, 35000],
    ['£30k–£40k', 30000, 40000],
    ['£30k - £40k', 30000, 40000],
    ['£30-40k', 30000, 40000],
    ['£35,000 per annum', 35000, 35000],
    ['£35,000 to £45,000 a year', 35000, 45000],
    ['£45K/yr - £55K/yr', 45000, 55000],
    ['90K GBP/yr - 110K GBP/yr', 90000, 110000],
    ['75K GBP/yr', 75000, 75000],
    ['3K GBP/mo', 36000, 36000],
    ['20 GBP/hr - 25 GBP/hr', 39000, 48750],
    ['£18/hr', 35100, 35100],
    ['£18.50 per hour', 36075, 36075],
    ['£250/day', 65000, 65000],
    ['£400 - £500 per day', 104000, 130000],
    ['Up to £42,500 pa plus bonus', 42500, 42500],
  ])('%s', (text, min, max) => {
    expect(parseSalary(text)).toMatchObject({ min, max });
  });

  it('returns nothing when no pay is shown', () => {
    expect(parseSalary('Competitive salary')).toBeUndefined();
    expect(parseSalary(undefined)).toBeUndefined();
    expect(parseSalary('')).toBeUndefined();
  });

  it('ignores figures that are not pay', () => {
    expect(parseSalary('We raised £50m in Series B')).toBeUndefined();
    expect(parseSalary('£2.5bn processed each year')).toBeUndefined();
    expect(parseSalary('£500 wellbeing allowance')).toBeUndefined();
  });

  it('skips non-pay figures to reach the real one', () => {
    expect(parseSalary('Backed by £50m of funding. Salary: £38,000')).toMatchObject({ min: 38000 });
  });

  it('needs pay wording nearby when reading free text', () => {
    const opts = { requireContext: true };
    expect(parseSalary('Our customers save £20,000 on average.', opts)).toBeUndefined();
    expect(parseSalary('Starting salary of £36,000 plus benefits.', opts)).toMatchObject({ min: 36000 });
    expect(parseSalary('You will earn £300 per day.', opts)).toMatchObject({ min: 78000 });
  });
});

describe('checkSalary', () => {
  const floor = 33400;
  it('compares against the floor', () => {
    expect(checkSalary(parseSalary('£35k'), floor)).toBe('meets');
    expect(checkSalary(parseSalary('£33,400'), floor)).toBe('meets');
    expect(checkSalary(parseSalary('£28k'), floor)).toBe('below');
    expect(checkSalary(parseSalary('£25k-£30k'), floor)).toBe('below');
    expect(checkSalary(parseSalary('£30k-£40k'), floor)).toBe('straddles');
    expect(checkSalary(undefined, floor)).toBe('unknown');
  });
});

describe('formatSalary', () => {
  it('prints short figures', () => {
    expect(formatSalary({ min: 28000, max: 28000, raw: '' })).toBe('£28k');
    expect(formatSalary({ min: 33400, max: 40000, raw: '' })).toBe('£33.4k–£40k');
  });
});
