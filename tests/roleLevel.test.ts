import { describe, expect, it } from 'vitest';
import { roleFlags } from '../src/engine/roleLevel';

describe('roleFlags', () => {
  it.each([
    [{ title: 'Software Engineering Apprentice' }, 'apprenticeship'],
    [{ title: 'Degree Apprenticeship - Software' }, 'apprenticeship'],
    [{ title: 'IT Support Engineer' }, 'IT support role'],
    [{ title: 'Helpdesk Analyst' }, 'helpdesk role'],
    [{ title: '1st Line Service Desk' }, 'helpdesk role'],
    [{ title: 'Developer (Part-time)' }, 'part-time'],
    [{ title: 'Developer', meta: 'Hybrid · Part time' }, 'part-time'],
    [{ title: 'Contract Java Developer', description: 'Rate £500/day, inside IR35.' }, 'inside IR35'],
    [{ title: 'Developer', description: 'This is a 6 month fixed-term contract.' }, '6-month contract'],
    [{ title: 'Developer', description: 'Fixed term contract for 9 months initially.' }, '9-month contract'],
    [{ title: 'Developer - 3 Month Contract' }, '3-month contract'],
  ])('%j -> %s', (input, flag) => {
    expect(roleFlags(input)).toContain(flag);
  });

  it('does not flag ordinary roles', () => {
    expect(roleFlags({ title: 'Graduate Software Engineer', meta: 'Full-time', description: 'Permanent role. We also run apprenticeship schemes and support part-time study.' })).toEqual([]);
    expect(roleFlags({ title: 'Developer', description: '12 month fixed-term contract.' })).toEqual([]);
    expect(roleFlags({ title: 'Developer', description: '24 month contract, outside IR35.' })).toEqual([]);
  });
});
