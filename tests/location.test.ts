import { describe, expect, it } from 'vitest';
import { outsideUk } from '../src/engine/location';

describe('outsideUk', () => {
  it.each(['London, United Kingdom', 'Hybrid work in London EC4M 7EF', 'GB', 'Remote (United Kingdom)', 'Edinburgh', 'New York; London', 'Manchester, England'])('UK: %s', (loc) => {
    expect(outsideUk(loc)).toBeUndefined();
  });
  it.each(['New York, 745 7th Avenue, United States of America', 'Dublin, Ireland', 'Remote (United States)', 'San Francisco, CA'])('outside: %s', (loc) => {
    expect(outsideUk(loc)).toBe(loc);
  });
  it('says nothing when the location says nothing', () => {
    for (const loc of [undefined, '', 'Remote', 'Hybrid', 'Multiple locations']) expect(outsideUk(loc)).toBeUndefined();
  });
});
