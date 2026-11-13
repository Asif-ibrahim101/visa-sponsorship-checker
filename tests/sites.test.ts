// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companyFromTitle, readGreenhouse } from '../src/content/sites/greenhouse';
import { findIndeedCards, readIndeedDetail } from '../src/content/sites/indeed';
import { activeAdapters } from '../src/content/sites';
import { cleanEmployer, descriptionText, findJobPosting, locationText, readJsonLd, salaryText, siteCompany } from '../src/content/sites/jsonld';

const load = (name: string) => new DOMParser().parseFromString(readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8'), 'text/html');
const page = (head: string, body: string) => new DOMParser().parseFromString(`<html><head>${head}</head><body>${body}</body></html>`, 'text/html');
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

// Shapes seen on the live sites on 2026-11-12.
const LEVER = {
  '@context': 'http://schema.org',
  '@type': 'JobPosting',
  title: 'Administrative Business Partner',
  hiringOrganization: { '@type': 'Organization', name: 'Palantir Technologies' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'London, United Kingdom', addressCountry: null } },
  employmentType: 'FULL_TIME',
  description: '<p>Support the London team.</p><ul><li>Diaries</li></ul>',
};
const WORKDAY = {
  '@context': 'http://schema.org',
  '@type': 'JobPosting',
  title: 'Senior Analyst - Credit Research',
  identifier: { '@type': 'PropertyValue', name: 'Senior Analyst - Credit Research', value: 'JR-0000137812' },
  hiringOrganization: { '@type': 'Organization', name: '2764 Barclays Capital Inc.' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'United States of America', addressLocality: 'New York, 745 7th Avenue' } },
  description: '&lt;p&gt;Credit research for US markets.&lt;/p&gt;',
};
const WTTJ = [
  {
    '@type': 'JobPosting',
    title: 'Finance Forecasting Modeller',
    hiringOrganization: { name: 'Monzo' },
    jobLocation: [{ '@type': 'Place', address: { addressCountry: 'GB', streetAddress: 'UK' } }],
    baseSalary: { '@type': 'MonetaryAmount', currency: 'GBP', value: { '@type': 'QuantitativeValue', minValue: 55000, maxValue: 70000, unitText: 'YEAR' } },
    description: '<p>Model the forecast.</p>',
  },
];

describe('JobPosting pages (Lever, Ashby, Workday, Welcome to the Jungle, company sites)', () => {
  it('reads a Lever posting and places the badge by its title heading', () => {
    const doc = page(ld(LEVER), '<div class="posting-headline"><h2>Administrative Business Partner</h2></div>');
    const d = readJsonLd(doc, 'https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c')!;
    expect(d.job).toMatchObject({ title: 'Administrative Business Partner', company: 'Palantir Technologies', location: 'London, United Kingdom', meta: 'Full-time' });
    expect(d.job.companyAlt).toBe('palantir');
    expect(d.anchor.tagName).toBe('H2');
    expect(d.description).toBe('Support the London team.\nDiaries');
  });

  it('cleans Workday employer codes, unescapes the advert and keeps the site name as a fallback', () => {
    const doc = page(ld(WORKDAY), '<h1></h1><h2>Senior Analyst - Credit Research</h2>');
    const d = readJsonLd(doc, 'https://barclays.wd3.myworkdayjobs.com/en-US/External_Career_Site_Barclays/job/x_JR-0000137812')!;
    expect(d.job).toMatchObject({ company: 'Barclays Capital Inc.', companyAlt: 'barclays', location: 'New York, 745 7th Avenue, United States of America' });
    expect(d.job.jobId).toBe('ld:barclays.wd3.myworkdayjobs.com:JR-0000137812');
    expect(d.description).toBe('Credit research for US markets.');
  });

  it('reads JobPosting inside an array, with a GBP salary, and a heading that adds the company name', () => {
    const doc = page(ld(WTTJ), '<h1>Finance Forecasting Modeller Monzo</h1>');
    const d = readJsonLd(doc, 'https://www.welcometothejungle.com/en/companies/monzo/jobs/finance-forecasting-modeller_gb_h6d3zzno')!;
    expect(d.job).toMatchObject({ company: 'Monzo', salaryText: '£55000 - £70000 a year', location: 'GB' });
    expect(d.job.companyAlt).toBeUndefined(); // same as the company
    expect(d.anchor.tagName).toBe('H1');
  });

  it('falls back to a corner badge when no heading shows the title', () => {
    const doc = page(ld(LEVER), '<div>No headings here</div>');
    const d = readJsonLd(doc, 'https://careers.example.com/jobs/1')!;
    expect(d.anchor.closest('#vsc-float')).not.toBeNull();
  });

  it('finds JobPosting in @graph and ignores pages without one', () => {
    expect(findJobPosting(page(ld({ '@graph': [{ '@type': 'Organization' }, LEVER] }), ''))?.title).toBe(LEVER.title);
    expect(findJobPosting(page(ld({ '@type': 'Organization', name: 'x' }), ''))).toBeUndefined();
    expect(findJobPosting(page('<script type="application/ld+json">{ broken JobPosting</script>', ''))).toBeUndefined();
  });

  it('helpers', () => {
    expect(cleanEmployer('2764 Barclays Capital Inc.')).toBe('Barclays Capital Inc.');
    expect(salaryText({ baseSalary: { currency: 'USD', value: { minValue: 100000 } } })).toBeUndefined();
    expect(salaryText({ baseSalary: { currency: 'GBP', value: { value: 25, unitText: 'HOUR' } } })).toBe('£25 a hour');
    expect(locationText({ jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { name: 'United Kingdom' } })).toBe('Remote (United Kingdom)');
    expect(descriptionText('<p>a</p><p>b</p>')).toBe('a\nb');
    expect(siteCompany(new URL('https://jobs.ashbyhq.com/synthesia/28bd'))).toBe('synthesia');
    expect(siteCompany(new URL('https://example.com/careers'))).toBeUndefined();
  });
});

describe('Greenhouse', () => {
  const doc = load('live-structure-greenhouse-job.html');
  const d = readGreenhouse(doc, 'https://job-boards.greenhouse.io/monzo/jobs/7904675')!;

  it('reads the job and takes the company from the tab title', () => {
    expect(d.job).toMatchObject({ jobId: 'gh:7904675', title: 'Graduate Backend Engineer', company: 'Monzo', location: 'London' });
    expect(d.anchor.tagName).toBe('H1');
    expect(d.description).toContain('We sponsor visas for this role.');
  });

  it('works inside the embedded frame on a company site', () => {
    const e = readGreenhouse(doc, 'https://job-boards.greenhouse.io/embed/job_app?for=monzo&token=7904675')!;
    expect(e.job).toMatchObject({ jobId: 'gh:7904675', company: 'Monzo' });
  });

  it('companyFromTitle', () => {
    expect(companyFromTitle('Job Application for Engineer at Acme Ltd')).toBe('Acme Ltd');
    expect(companyFromTitle('Careers')).toBeUndefined();
  });
});

describe('Indeed', () => {
  const doc = load('live-structure-indeed-search.html');

  it('reads search result cards', () => {
    const cards = findIndeedCards(doc);
    expect(cards.map((c) => c.job)).toMatchObject([
      { jobId: 'indeed:aaa1110000000001', title: 'Graduate Software Engineer', company: 'Ada Meher', location: 'Hybrid work in London EC4M 7EF', salaryText: '£40,000 - £45,000 a year' },
      { jobId: 'indeed:bbb2220000000002', title: 'Junior Developer', company: 'Monzo', location: 'London' },
    ]);
    expect(cards[0].el.tagName).toBe('LI');
    expect(cards[0].anchor.getAttribute('data-testid')).toBe('company-name');
  });

  it('reads the open job, borrowing the company from its card', () => {
    const d = readIndeedDetail(doc, 'https://uk.indeed.com/jobs?q=x&vjk=bbb2220000000002')!;
    expect(d.job).toMatchObject({ jobId: 'indeed:bbb2220000000002', title: 'Junior Developer', company: 'Monzo', salaryText: expect.stringContaining('£38,000 a year') });
    expect(d.description).toContain('We are unable to sponsor visas.');
  });
});

describe('choosing readers', () => {
  it('uses the site reader and the JobPosting reader together where both apply', () => {
    const doc = page(ld(LEVER), '');
    expect(activeAdapters(new URL('https://jobs.lever.co/x/y'), doc).map((a) => a.id)).toEqual(['jsonld']);
    expect(activeAdapters(new URL('https://uk.indeed.com/viewjob?jk=1'), doc).map((a) => a.id)).toEqual(['indeed', 'jsonld']);
    expect(activeAdapters(new URL('https://www.linkedin.com/jobs/view/1'), doc).map((a) => a.id)).toEqual(['linkedin']);
    expect(activeAdapters(new URL('https://www.linkedin.com/feed/'), doc)).toEqual([]);
    expect(activeAdapters(new URL('https://news.example.com/'), page('', '<p>hi</p>'))).toEqual([]);
  });
});
