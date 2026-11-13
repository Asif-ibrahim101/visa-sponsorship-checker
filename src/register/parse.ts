import Papa from 'papaparse';

export const REGISTER_PAGE = 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';

const CSV_LINK = /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"'\s<>]+\.csv/i;

/** The CSV's address changes on every republish, so it is read off the GOV.UK page. */
export function findCsvUrl(pageHtml: string): string | undefined {
  return CSV_LINK.exec(pageHtml)?.[0].replace(/&amp;/g, '&');
}

/**
 * Returns the unique organisation names holding a Skilled Worker licence.
 * Columns: Organisation Name, Town/City, County, Type & Rating, Route.
 */
export function parseRegisterCsv(csv: string): string[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const fields = parsed.meta.fields ?? [];
  const nameField = fields.find((f) => f.includes('organisation'));
  const routeField = fields.find((f) => f === 'route');
  if (!nameField || !routeField) {
    throw new Error(`Register CSV has unexpected columns: ${fields.join(', ') || '(none)'}`);
  }

  const names = new Set<string>();
  for (const row of parsed.data) {
    if ((row[routeField] ?? '').trim().toLowerCase() !== 'skilled worker') continue;
    const name = (row[nameField] ?? '').replace(/\s+/g, ' ').trim();
    if (name) names.add(name);
  }
  return [...names];
}
