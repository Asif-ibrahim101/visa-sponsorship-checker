import { describe, expect, it } from 'vitest';
import { jaroWinkler } from '../src/engine/jaroWinkler';
import { RegisterIndex, spellingSlip, withinOneEdit } from '../src/engine/matcher';

const index = new RegisterIndex([
  'Barclays Bank PLC',
  'Barclays Bank UK PLC',
  'Barclays Execution Services Limited',
  'Monzo Bank Ltd',
  'Revolut Ltd',
  'Wise Payments Limited',
  'Apple Tree Nursery Ltd',
  'BRANOS OXFORD LTD T/A LILO',
  'Digital Solutions Ltd',
  'Checkout Ltd',
  'Thoughtworks Limited',
  'ALT',
  'Maxico Uk limited t/a The Amazon',
  'Amazon UK Services Ltd',
  'CAPITAL ONE (EUROPE) PLC',
  'Capital Com (UK) Limited',
  'Eleven Labs Ltd',
  'Facebook UK',
  'Paddlers UK Ltd.',
  'Klarna Bank AB UK Branch',
  'Man & Co',
  'MAN CORPORATION LIMITED',
  'Man Capital LLP',
  'Man Group Services Limited',
  'Deutsche Finance International LLP',
  'DB Group Services (UK) Ltd',
  'ATOM CONSULTING SERVICES LIMITED',
  'IMC Systems Ltd',
  'IMK Trading limited',
  'The MAC Trading Company',
  'Mako Global Derivatives Partnership LLP',
  'PRIMERA CORPORATION LIMITED',
  'Stripe Partners',
  'STRIPE CONSULTING LIMITED',
  'Atlas Market Ltd',
  'Atlas Technology Solutions UK Limited',
  'CHECKOUT LTD',
  'Bending Spoons Operations S.P.A.(UK Branch)',
  'RELX (UK) Limited',
]);

describe('jaroWinkler', () => {
  it('matches the textbook values', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.9611, 3);
    expect(jaroWinkler('dixon', 'dicksonx')).toBeCloseTo(0.8133, 3);
    expect(jaroWinkler('same', 'same')).toBe(1);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
    expect(jaroWinkler('', 'abc')).toBe(0);
  });
});

describe('RegisterIndex.match', () => {
  it('matches exactly after normalising', () => {
    const m = index.match('Revolut');
    expect(m).toMatchObject({ licensed: true, kind: 'exact', registerNames: ['Revolut Ltd'], score: 1 });
  });

  it('counts a brand as licensed when any of its legal entities is', () => {
    const m = index.match('Barclays');
    expect(m.licensed).toBe(true);
    expect(m.kind).toBe('brand');
    expect(m.registerNames).toContain('Barclays Bank PLC');
  });

  it('matches a brand to its legal entity in either direction', () => {
    expect(index.match('Monzo')).toMatchObject({ licensed: true, kind: 'brand', registerNames: ['Monzo Bank Ltd'] });
    expect(index.match('Wise')).toMatchObject({ licensed: true, registerNames: ['Wise Payments Limited'] });
    expect(index.match('Revolut Technologies')).toMatchObject({ licensed: true, kind: 'brand' });
  });

  it('matches on a trading name embedded in the register name', () => {
    expect(index.match('Lilo')).toMatchObject({ licensed: true, kind: 'trading_name', registerNames: ['BRANOS OXFORD LTD T/A LILO'] });
  });

  it('accepts close spellings and reports the score', () => {
    expect(index.match('Thoughtworks').kind).toBe('exact');
    expect(index.match('Thoughtwork').kind).toBe('fuzzy');
    expect(index.match('Thoughtwork').score).toBeGreaterThanOrEqual(0.92);
  });

  it('prefers a legal entity over an unrelated business trading under the same word', () => {
    expect(index.match('Amazon')).toMatchObject({ kind: 'brand', registerNames: ['Amazon UK Services Ltd'] });
  });

  it('ignores spacing differences', () => {
    expect(index.match('ElevenLabs')).toMatchObject({ kind: 'exact', registerNames: ['Eleven Labs Ltd'] });
  });

  it('knows brands registered under an unrelated name', () => {
    expect(index.match('Meta')).toMatchObject({ licensed: true, kind: 'alias', registerNames: ['Facebook UK'] });
    // The alias target is not in this register, so the alias is ignored.
    expect(index.match('PwC').licensed).toBe(false);
  });

  it('sees through branch and country wording', () => {
    expect(index.match('Klarna')).toMatchObject({ kind: 'brand', registerNames: ['Klarna Bank AB UK Branch'] });
    expect(index.match('Capital One')).toMatchObject({ licensed: true, registerNames: ['CAPITAL ONE (EUROPE) PLC'] });
  });

  it('does not fuzzy-match a different word of similar spelling', () => {
    expect(index.match('Capital Onc').registerNames).not.toContain('Capital Com (UK) Limited');
    expect(index.match('Paddle').licensed).toBe(false);
    expect(index.match('Mako Trade').registerNames).not.toContain('The MAC Trading Company');
  });

  it('does not match a brand to an unrelated company sharing its first word', () => {
    expect(index.match('Apple').licensed).toBe(false);
  });

  it('does not brand-match names made only of generic words', () => {
    expect(index.match('Digital Consulting').licensed).toBe(false);
  });

  it('does not fuzzy-match short names', () => {
    expect(index.match('ALX').licensed).toBe(false);
  });

  it('reports no match for an unknown company', () => {
    expect(index.match('Zebra Quantum Widgets')).toMatchObject({ licensed: false, registerNames: [] });
    expect(index.match('').licensed).toBe(false);
  });
});

describe('match quality', () => {
  it('calls it exact only when the names differ by legal forms alone', () => {
    expect(index.match('Revolut Limited').kind).toBe('exact');
    expect(index.match('Barclays Bank UK').kind).toBe('exact');
    // The register lists this company twice in different case; it is shown once.
    expect(index.match('Checkout.com')).toMatchObject({ licensed: true, kind: 'similar', registerNames: ['Checkout Ltd'] });
  });

  it('uses curated aliases before anything else, whatever the spelling', () => {
    for (const name of ['Man Group', 'Man AHL', 'man group plc']) {
      expect(index.match(name), name).toMatchObject({ kind: 'alias', registerNames: ['Man Group Services Limited'] });
    }
    expect(index.match('Deutsche Bank')).toMatchObject({ kind: 'alias', registerNames: ['DB Group Services (UK) Ltd'] });
    expect(index.match('Mako Trading').registerNames).toEqual(['Mako Global Derivatives Partnership LLP']);
  });

  it('sees through foreign legal forms and branch wording', () => {
    expect(index.match('Bending Spoons')).toMatchObject({ licensed: true, registerNames: ['Bending Spoons Operations S.P.A.(UK Branch)'] });
    expect(index.match('LexisNexis Risk Solutions')).toMatchObject({ kind: 'alias', registerNames: ['RELX (UK) Limited'] });
  });

  it('ranks the candidate sharing most words first', () => {
    const small = new RegisterIndex(['Foo Corporation Ltd', 'Foo & Co', 'Foo Group Services Limited']);
    const m = small.match('Foo Group');
    expect(m).toMatchObject({ kind: 'similar', ambiguous: true });
    expect(m.registerNames[0]).toBe('Foo Group Services Limited');
  });

  it('flags a name shared by several unrelated sponsors', () => {
    expect(index.match('Atlas')).toMatchObject({ licensed: true, ambiguous: true });
    // Barclays Bank PLC and Barclays Bank UK PLC are one bank for this purpose.
    expect(index.match('Barclays')).toMatchObject({ ambiguous: false, registerNames: ['Barclays Bank PLC'] });
  });

  it('rejects a brand match whose line of business disagrees', () => {
    expect(index.match('Atom bank').licensed).toBe(false);
    expect(index.match('IMC Trading').licensed).toBe(false);
    expect(index.match('Lloyds Banking Group').licensed).toBe(false); // no Lloyds entity in this small register
  });

  it('only accepts typos in longer words', () => {
    expect(index.match('Primer').licensed).toBe(false);
    expect(index.match('IMC Trading').registerNames).not.toContain('IMK Trading limited');
    expect(spellingSlip('thoughtwork', 'thoughtworks')).toBe(true);
    expect(spellingSlip('imc trading', 'imk trading')).toBe(false);
    expect(spellingSlip('mako trading', 'mac trading')).toBe(false);
    expect(withinOneEdit('abc', 'abd')).toBe(true);
    expect(withinOneEdit('abc', 'ab')).toBe(true);
    expect(withinOneEdit('abc', 'acb')).toBe(false);
  });
});

describe('RegisterIndex.search', () => {
  it('lists entries containing the query words, prefix matches first', () => {
    expect(index.search('barclays')).toHaveLength(3);
    expect(index.search('stripe')).toEqual(['Stripe Partners', 'STRIPE CONSULTING LIMITED']);
    expect(index.search('execution barclays')).toEqual(['Barclays Execution Services Limited']);
    expect(index.search('')).toEqual([]);
  });
});
