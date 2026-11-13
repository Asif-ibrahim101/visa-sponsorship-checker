import { describe, expect, it } from 'vitest';
import { classifyText, HARD_NEGATIVE, phraseStamp, POSITIVE } from '../src/engine/phrases';

describe('classifyText', () => {
  it.each([
    'No sponsorship is offered for this role.',
    'We are unable to sponsor visas.',
    'We cannot sponsor candidates at this time.',
    'We are not able to offer sponsorship.',
    'You must be able to work in the UK without requiring sponsorship.',
    'UK nationals only.',
    'Candidates must hold SC Clearance.',
    'DV clearance required.',
    'You must be eligible for security clearance.',
    'Unfortunately we are unable to offer visa sponsorship for this position.',
    'We can’t sponsor visas for this role.',
  ])('hard negative: %s', (text) => {
    const s = classifyText(text);
    expect(s.hardNegative.length).toBeGreaterThan(0);
    expect(s.positive).toEqual([]);
  });

  it.each([
    'Visa sponsorship available for the right candidate.',
    'Sponsorship provided.',
    'We sponsor visas.',
    'Skilled Worker visa sponsorship offered.',
    'We are open to sponsorship.',
    'We can offer visa   sponsorship.',
  ])('positive: %s', (text) => {
    const s = classifyText(text);
    expect(s.positive.length).toBeGreaterThan(0);
    expect(s.hardNegative).toEqual([]);
  });

  it('treats a negated positive phrase as negative', () => {
    for (const text of [
      'No visa sponsorship available.',
      'Sorry, we do not have sponsorship available for this role.',
      'This role is not open to sponsorship.',
      'We are unable at this time to say that we will sponsor.',
    ]) {
      const s = classifyText(text);
      expect(s.positive, text).toEqual([]);
      expect(s.hardNegative.length, text).toBeGreaterThan(0);
    }
  });

  it('only lets a negator reach within its own sentence', () => {
    const s = classifyText('No agencies please. Visa sponsorship available.');
    expect(s.positive).toEqual(['visa sponsorship available']);
    expect(s.hardNegative).toEqual([]);
  });

  it('treats right-to-work wording as soft, not a hard no', () => {
    const s = classifyText('You must have the right to work in the UK.');
    expect(s.softNegative).toEqual(['must have the right to work']);
    expect(s.hardNegative).toEqual([]);
    expect(classifyText('Applicants must have right to work in the UK').softNegative).toHaveLength(1);
  });

  it('reports both sides when an advert contradicts itself', () => {
    const s = classifyText('Visa sponsorship available.\nPlease note we cannot sponsor contractors.');
    expect(s.positive).toHaveLength(1);
    expect(s.hardNegative).toHaveLength(1);
  });

  it('finds nothing in an advert that is silent on visas', () => {
    expect(classifyText('Build great software with a friendly team. Competitive salary.')).toEqual({ hardNegative: [], softNegative: [], positive: [], mentions: [] });
  });

  it('matches whole words only', () => {
    expect(classifyText('Experience with DISC clearance tooling and ESC cleared paths').hardNegative).toEqual([]);
  });

  it('quotes one phrase per statement', () => {
    expect(classifyText('We are unable to offer visa sponsorship.').hardNegative).toEqual(['unable to offer visa sponsorship']);
  });

  it('uses extra phrases from settings', () => {
    expect(classifyText('Relocation and visa support included.', { extraPositive: ['visa support'] }).positive).toEqual(['visa support']);
    expect(classifyText('Settled status required.', { extraNegative: ['settled status'] }).hardNegative).toEqual(['settled status']);
  });

  it('covers every phrase the PRD lists', () => {
    for (const p of ['no sponsorship', 'unable to sponsor', 'cannot sponsor', 'UK nationals only', 'SC clearance', 'DV clearance', 'eligible for security clearance']) {
      expect(HARD_NEGATIVE).toContain(p);
    }
    for (const p of ['visa sponsorship available', 'sponsorship provided', 'we sponsor visas', 'skilled worker visa sponsorship', 'open to sponsorship']) {
      expect(POSITIVE).toContain(p);
    }
  });
});

describe('sentence-level reading (wording from real adverts)', () => {
  it.each([
    "We're proud to support visa sponsorship for candidates who need it.",
    'We sponsor work visas and handle the process with you, start to finish.',
    'Location: London - onsite 5 days per week🌍 Will relocate and sponsor🎓 Experience: 0-2 years',
    'Sponsorship for the Skilled Worker route is something we regularly do.',
    '• Visa sponsorship and immigration support\n• 25 days holiday',
  ])('positive: %s', (text) => {
    const s = classifyText(text);
    expect(s.positive.length).toBeGreaterThan(0);
    expect(s.hardNegative).toEqual([]);
  });

  it.each([
    'We are not in a position to sponsor visas for this role.',
    'Unfortunately this role is not eligible for visa sponsorship from us.',
    "We won't be able to provide immigration sponsorship.",
  ])('negative: %s', (text) => {
    expect(classifyText(text).hardNegative.length).toBeGreaterThan(0);
    expect(classifyText(text).positive).toEqual([]);
  });

  it('treats "candidates who do not need sponsorship" as a preference, not a refusal', () => {
    const s = classifyText('Candidates who do not need visa sponsorship will be prioritised.');
    expect(s.softNegative).toHaveLength(1);
    expect(s.hardNegative).toEqual([]);
  });

  it('does not guess from a question; it quotes it instead', () => {
    for (const text of ['Please state whether you require visa sponsorship.', 'Do you now or will you in future require sponsorship?']) {
      const s = classifyText(text);
      expect(s.positive, text).toEqual([]);
      expect(s.hardNegative, text).toEqual([]);
      expect(s.mentions, text).toHaveLength(1);
    }
  });

  it('ignores sponsoring that has nothing to do with visas', () => {
    for (const text of ['We sponsor hackathons and local meetups.', 'Proud sponsor of the London Marathon.', 'We partner with Visa and Mastercard.']) {
      expect(classifyText(text), text).toEqual({ hardNegative: [], softNegative: [], positive: [], mentions: [] });
    }
  });

  it('reads each bullet on its own, so one negative bullet does not spoil the next', () => {
    const s = classifyText('No agencies please\nVisa sponsorship and immigration support');
    expect(s.positive).toHaveLength(1);
    expect(s.hardNegative).toEqual([]);
  });

  it('quotes a long sentence around the key word', () => {
    const long = 'Our hiring process is fast and friendly and we really care about every candidate, and we are glad to sponsor visas for engineers relocating from abroad to join the London office team.';
    const [q] = classifyText(long).positive;
    expect(q.length).toBeLessThanOrEqual(92);
    expect(q).toContain('sponsor');
    expect(q).toMatch(/^…[a-z]/); // starts on a whole word
  });

  it('lists a sentence once even when the advert repeats it with a different dash', () => {
    const s = classifyText('Start-up | £100k-£200k | Visa sponsorship + relocation\nStart-up | £100k–£200k | Visa sponsorship + relocation');
    expect(s.positive).toHaveLength(1);
  });
});

describe('phraseStamp', () => {
  it('changes when the extra phrases change', () => {
    expect(phraseStamp({ extraNegative: ['a'] })).not.toBe(phraseStamp({ extraNegative: ['b'] }));
    expect(phraseStamp({})).toBe(phraseStamp({ extraPositive: [], extraNegative: [] }));
  });
});
