// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockText, findCards, jobIdFromUrl, OWN, pageText, readDetail } from '../src/content/linkedinAdapter';

/**
 * These fixtures are hand-written stand-ins. Save real pages into
 * tests/fixtures/ and add them here to test against LinkedIn's live markup.
 */
function load(name: string): Document {
  const html = readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('jobIdFromUrl', () => {
  it.each([
    ['https://www.linkedin.com/jobs/search/?currentJobId=4000000001&keywords=software', '4000000001'],
    ['https://www.linkedin.com/jobs/view/4000000001/', '4000000001'],
    ['/jobs/view/4000000001?trk=abc', '4000000001'],
    ['https://uk.linkedin.com/jobs/view/graduate-software-engineer-at-monzo-bank-4000000001?position=1', '4000000001'],
    ['https://www.linkedin.com/jobs/collections/recommended/', undefined],
  ])('%s', (href, id) => {
    expect(jobIdFromUrl(href)).toBe(id);
  });
});

describe('search page with familiar markup', () => {
  const doc = load('synthetic-search.html');
  const cards = findCards(doc);

  it('finds each rendered card once and skips the empty placeholder', () => {
    expect(cards.map((c) => c.job.jobId)).toEqual(['4000000001', '4000000002']);
    expect(cards[0].el.tagName).toBe('LI');
  });

  it('reads title, company and salary from a card', () => {
    expect(cards[0].job).toMatchObject({
      title: 'Graduate Software Engineer',
      company: 'Monzo Bank',
      salaryText: '£45K/yr - £55K/yr',
    });
    expect(cards[1].job).toMatchObject({ title: 'IT Support Apprentice', company: 'Acme Widgets Ltd', salaryText: undefined });
  });

  it('reads the open job from the detail pane', () => {
    const detail = readDetail(doc, 'https://www.linkedin.com/jobs/search/?currentJobId=4000000001');
    expect(detail?.job).toMatchObject({
      jobId: '4000000001',
      title: 'Graduate Software Engineer',
      company: 'Monzo Bank',
      salaryText: '£45K/yr - £55K/yr',
    });
    expect(detail?.job.meta).toContain('Full-time');
    expect(detail?.description).toContain('Visa sponsorship is available for this role.');
    expect(detail?.anchor.className).toContain('job-title');
  });

  it('keeps paragraphs and list items on separate lines', () => {
    const detail = readDetail(doc, 'https://www.linkedin.com/jobs/search/?currentJobId=4000000001');
    expect(detail?.description?.split('\n')).toEqual([
      "We're looking for a graduate engineer to join our payments team.",
      'Build services in Go',
      'Work with a friendly squad',
      'Salary £45,000 - £55,000 per annum.',
      'Visa sponsorship is available for this role.',
    ]);
  });

  it('does not treat similar jobs inside the detail pane as cards, or read their salary', () => {
    expect(cards.some((c) => c.job.jobId === '4000000099')).toBe(false);
  });

  it('prefers the job ID in the pane over a URL that has already moved on', () => {
    const detail = readDetail(doc, 'https://www.linkedin.com/jobs/search/?currentJobId=4000000002');
    expect(detail?.job.jobId).toBe('4000000001');
  });
});

describe('2026 /jobs/search-results/ layout (structure captured from the live page)', () => {
  const doc = load('live-structure-2026-search.html');
  const cards = findCards(doc);
  const detail = readDetail(doc, 'https://www.linkedin.com/jobs/search-results/?currentJobId=4484663250&keywords=x');

  it('finds the button-style cards and nothing else', () => {
    expect(cards.map((c) => c.job)).toMatchObject([
      { jobId: '4483907268', title: 'Software Engineer', company: 'Oliver Bernard', salaryText: '90K GBP/yr - 110K GBP/yr' },
      { jobId: '4484663250', title: 'Software Engineer, New Grad', company: 'Stripe', salaryText: undefined },
    ]);
  });

  it('puts the status on the card box and the badge beside the company', () => {
    expect(cards[0].el.getAttribute('role')).toBe('button');
    expect(cards[0].anchor.tagName).toBe('P');
  });

  it('reads the open job', () => {
    expect(detail?.job).toMatchObject({
      jobId: '4484663250',
      title: 'Software Engineer, New Grad',
      company: 'Stripe',
      salaryText: '50K GBP/yr - 60K GBP/yr',
    });
    expect(detail?.job.meta).toContain('Full-time');
    expect(detail?.anchor.tagName).toBe('A');
  });

  it('reads the advert, not the company blurb below it', () => {
    expect(detail?.description).toContain('We are able to offer visa sponsorship for this role.');
    expect(detail?.description).not.toContain('sponsor lunch');
    expect(detail?.description?.split('\n')).toContain('Strong CS fundamentals');
  });
});

describe('2026 /jobs/view/ page (structure captured from the live page)', () => {
  const doc = load('live-structure-2026-job-view.html');
  const detail = readDetail(doc, 'https://www.linkedin.com/jobs/view/4461533713/');

  it('takes the title from the tab title, not from the chips', () => {
    expect(detail?.job).toMatchObject({ jobId: '4461533713', title: 'Software Engineer, New Grad', company: 'Stripe' });
    expect(detail?.anchor.tagName).toBe('P');
    expect(detail?.anchor.closest('#JobDetails_AboutTheJob_4461533713')).toBeNull();
    expect(detail?.description).toContain('We sponsor visas for this role.');
  });

  it('does not turn menus or job chips into cards', () => {
    expect(findCards(doc)).toEqual([]);
  });
});

describe('results list with class names the adapter has never seen', () => {
  const cards = findCards(load('synthetic-unknown-layout.html'));

  it('falls back to job links and page structure', () => {
    expect(cards.map((c) => c.job)).toMatchObject([
      { jobId: '4100000001', title: 'Backend Engineer', company: 'Wise', salaryText: '£60,000 - £75,000' },
      { jobId: '4100000002', title: 'Data Analyst (Part-time)', company: 'Example Recruitment' },
    ]);
  });
});

describe('stand-alone job page', () => {
  const doc = load('synthetic-job-view.html');
  const detail = readDetail(doc, 'https://www.linkedin.com/jobs/view/4200000001/');

  it('reads the job from an unfamiliar layout', () => {
    expect(detail?.job).toMatchObject({ jobId: '4200000001', title: 'Junior Developer', company: 'Acme Widgets Ltd' });
    expect(detail?.description).toContain('unable to offer visa sponsorship');
    expect(detail?.job.meta).toContain('Contract');
  });

  it('finds no detail on a page that is not a job', () => {
    expect(readDetail(new DOMParser().parseFromString('<main><h1>Feed</h1></main>', 'text/html'), 'https://www.linkedin.com/feed/')).toBeUndefined();
  });
});

describe('text helpers', () => {
  it("never read back this extension's own badge", () => {
    const doc = new DOMParser().parseFromString(`<div id="c">Monzo Bank<span ${OWN}="">Sponsors</span></div>`, 'text/html');
    const el = doc.getElementById('c')!;
    expect(pageText(el)).toBe('Monzo Bank');
    expect(blockText(el)).toBe('Monzo Bank');
  });

  it('still reads the company after a badge has been added to the card', () => {
    const doc = load('synthetic-search.html');
    const [card] = findCards(doc);
    const badge = doc.createElement('span');
    badge.setAttribute(OWN, '');
    badge.className = 'vsc-badge';
    badge.textContent = 'Possible';
    card.anchor.appendChild(badge);
    expect(findCards(doc)[0].job.company).toBe('Monzo Bank');
  });
});
