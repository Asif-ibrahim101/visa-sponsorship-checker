import { describe, expect, it } from 'vitest';
import { entryLevel, readExperience } from '../src/engine/experience';

describe('readExperience', () => {
  it.each([
    ['You will have 3+ years of experience with Go.', 3],
    ["0-2 years' commercial experience.", 0],
    ['At least 5 years experience in fintech.', 5],
    ['Minimum of 2 years of hands-on software engineering experience.', 2],
    ['1–3 years of professional experience', 1],
  ])('%s -> %s', (text, years) => {
    expect(readExperience(text).minYears).toBe(years);
  });

  it('keeps the most demanding requirement', () => {
    expect(readExperience('1 year with React. 4+ years of backend experience.')).toMatchObject({ minYears: 4, yearsText: '4+ years of backend experience' });
  });

  it('ignores years that are not an experience requirement', () => {
    expect(readExperience('We have been growing for 10 years. 25 days holiday.').minYears).toBeUndefined();
    expect(readExperience('Over 40 years of experience in banking, our firm...').minYears).toBeUndefined();
  });

  it('finds beginner wording', () => {
    expect(readExperience('Recent graduates welcome to apply.').entryPhrase).toBe('recent graduates');
    expect(readExperience('No prior experience required.').entryPhrase).toBe('no prior experience required');
    expect(readExperience('Join our 2027 graduate programme.').entryPhrase).toBe('graduate programme');
  });

  it('does not treat mentoring juniors as a junior role', () => {
    expect(readExperience('You will mentor junior engineers.').entryPhrase).toBeUndefined();
  });
});

describe('entryLevel', () => {
  it.each([
    ['Graduate Software Engineer', 'graduate'],
    ['Software Engineer, New Grad', 'new grad'],
    ['Junior Backend Developer', 'junior'],
    ['Entry-Level Data Engineer', 'entry-level'],
    ['Software Engineer I', 'engineer i'],
    ['Early Careers - Technology', 'early careers'],
    ['Associate Software Engineer', 'associate software'],
  ])('%s', (title, word) => {
    expect(entryLevel(title)?.toLowerCase()).toBe(`title says "${word}"`);
  });

  it.each(['Senior Software Engineer', 'Lead Engineer', 'Staff Engineer', 'Principal Developer', 'Software Engineering Intern', 'Software Development Engineer Apprentice', 'Software Engineer II'])(
    'not entry level: %s',
    (title) => {
      expect(entryLevel(title, { minYears: 0 })).toBeUndefined();
    },
  );

  it('says nothing about a neutral title until the advert is read', () => {
    expect(entryLevel('Software Engineer')).toBeUndefined();
    expect(entryLevel('Software Engineer', readExperience('0-2 years of experience'))).toBe("Advert asks for 0-2 years of experience");
    expect(entryLevel('Software Engineer', readExperience('Recent graduates welcome'))).toBe('Advert says "recent graduates"');
    expect(entryLevel('Software Engineer', readExperience('5+ years of experience'))).toBeUndefined();
  });

  it('lets the advert overrule a junior title that asks for 2+ years', () => {
    expect(entryLevel('Junior Developer', readExperience('You have 4+ years of experience.'))).toBeUndefined();
    expect(entryLevel('Junior Developer', readExperience('You have 1 year of experience.'))).toBe('Title says "Junior"');
    expect(entryLevel('Full Stack Developer', readExperience("At least 2 years' commercial experience"))).toBeUndefined();
    expect(entryLevel('Software Engineer', readExperience('2+ years of professional software development experience'))).toBeUndefined();
  });
});
