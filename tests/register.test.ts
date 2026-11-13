import { describe, expect, it } from 'vitest';
import { RegisterIndex } from '../src/engine/matcher';
import { findCsvUrl, parseRegisterCsv } from '../src/register/parse';

// Rows copied from the GOV.UK register, including its stray whitespace.
const CSV = `Organisation Name,Town/City,County,Type & Rating,Route
 AaruvikA Limited,Edinburgh,,Worker (A rating),Skilled Worker
 Asian African Foods Ltd , London  ,,Worker (A rating),Skilled Worker
Barclays Bank PLC,London,,Worker (A rating),Global Business Mobility: Senior or Specialist Worker
Barclays Bank PLC,London,,Worker (A rating),Skilled Worker
Monzo Bank Ltd,London,,Worker (A rating),Skilled Worker
Monzo Bank Ltd,London ,,Worker (A rating),Skilled Worker
"Smith, Jones & Co Ltd",Leeds,West Yorkshire,Worker (A rating),Skilled Worker
Holy Trinity Church,York,,Worker (A rating),Tier 2 Ministers of Religion
Barclays Execution Services Limited,London,,Temporary Worker (A rating),Global Business Mobility: Graduate Trainee
 BRANOS OXFORD LTD T/A LILO,Oxford,,Worker (A rating),Skilled Worker
`;

describe('parseRegisterCsv', () => {
  const names = parseRegisterCsv(CSV);

  it('keeps Skilled Worker rows only, trimmed and de-duplicated', () => {
    expect(names).toEqual(['AaruvikA Limited', 'Asian African Foods Ltd', 'Barclays Bank PLC', 'Monzo Bank Ltd', 'Smith, Jones & Co Ltd', 'BRANOS OXFORD LTD T/A LILO']);
  });

  it('feeds the matcher', () => {
    const index = new RegisterIndex(names);
    expect(index.match('Monzo').licensed).toBe(true);
    expect(index.match('Smith Jones and Co').licensed).toBe(true);
    expect(index.match('Holy Trinity Church').licensed).toBe(false);
    expect(index.match('Barclays Execution Services').licensed).toBe(false);
  });

  it('fails loudly when the columns change', () => {
    expect(() => parseRegisterCsv('Name,City\nFoo,Bar\n')).toThrow(/unexpected columns/);
  });
});

describe('findCsvUrl', () => {
  it('finds the current CSV link on the GOV.UK page', () => {
    const html = '<a class="govuk-link" href="https://assets.publishing.service.gov.uk/media/abc123/Worker_and_Temporary_Worker_Register_-_2026-11-10.csv">Register</a>';
    expect(findCsvUrl(html)).toBe('https://assets.publishing.service.gov.uk/media/abc123/Worker_and_Temporary_Worker_Register_-_2026-11-10.csv');
  });
  it('returns nothing when the page has no CSV', () => {
    expect(findCsvUrl('<html><body>Page not found</body></html>')).toBeUndefined();
  });
});
