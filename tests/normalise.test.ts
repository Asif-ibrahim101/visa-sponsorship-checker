import { describe, expect, it } from 'vitest';
import { brandCore, domainsCompatible, isAgency, normaliseName, splitTradingName, strictName } from '../src/engine/normalise';

describe('normaliseName', () => {
  it.each([
    ['Barclays Bank UK PLC', 'barclays bank'],
    ['Monzo Bank Ltd', 'monzo bank'],
    ['  AaruvikA Limited', 'aaruvika'],
    ['Apple (UK) Limited', 'apple'],
    ['Marks & Spencer Group plc', 'marks and spencer'],
    ["Sainsbury's Supermarkets Ltd", 'sainsburys supermarkets'],
    ['The Access Group', 'access'],
    ['Café Nero Holdings Ltd.', 'cafe nero'],
    ['UK Holdings Ltd', 'uk'],
    ['Checkout.com', 'checkout'],
    ['McKinsey & Company Inc. United Kingdom', 'mckinsey'],
    ['Bending Spoons Operations S.P.A.(UK Branch)', 'bending spoons operations'],
    ['Adyen N.V. London Branch', 'adyen nv london'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });
});

describe('splitTradingName', () => {
  it('splits an embedded trading name', () => {
    expect(splitTradingName('BRANOS OXFORD LTD T/A LILO')).toEqual({ legal: 'BRANOS OXFORD LTD', trading: 'LILO' });
    expect(splitTradingName('HAH Hospitality Limited t/a Indian Affair Ancoats').trading).toBe('Indian Affair Ancoats');
    expect(splitTradingName('Foo Ltd trading as Bar').trading).toBe('Bar');
  });
  it('leaves ordinary names alone', () => {
    expect(splitTradingName('Revolut Ltd')).toEqual({ legal: 'Revolut Ltd' });
  });
});

describe('brandCore', () => {
  it('drops trailing descriptors', () => {
    expect(brandCore('monzo bank')).toBe('monzo');
    expect(brandCore('wise payments')).toBe('wise');
    expect(brandCore('capital one europe')).toBe('capital one');
    expect(brandCore('klarna bank ab uk branch')).toBe('klarna');
    expect(brandCore('barclays execution services')).toBe('barclays execution');
  });
  it('refuses names made only of descriptors', () => {
    expect(brandCore('digital solutions')).toBeUndefined();
    expect(brandCore('global technology services')).toBeUndefined();
  });
});

describe('strictName', () => {
  it('drops only legal forms and spaces', () => {
    expect(strictName('Barclays Bank UK PLC')).toBe('barclaysbank');
    expect(strictName('Eleven Labs Ltd')).toBe(strictName('ElevenLabs'));
    expect(strictName('Man Group')).not.toBe(strictName('MAN CORPORATION LIMITED'));
  });
});

describe('domainsCompatible', () => {
  it('compares lines of business only when both names state one', () => {
    expect(domainsCompatible('Deutsche Bank', 'Deutsche Finance International LLP')).toBe(false);
    expect(domainsCompatible('Lloyds Banking Group', 'Lloyds Bank plc')).toBe(true);
    expect(domainsCompatible('Monzo', 'Monzo Bank Ltd')).toBe(true);
    expect(domainsCompatible('Ocado Technology', 'Ocado Retail Limited')).toBe(true);
  });
});

describe('isAgency', () => {
  it.each(['Understanding Recruitment', 'Oliver Bernard', 'Hays', 'Client Server', 'Acme Talent', 'Jobs via eFinancialCareers', 'Radley James', 'Harrington Starr', 'Aurum Search Limited'])('%s is an agency', (name) => {
    expect(isAgency(name)).toBe(true);
  });
  it.each(['Monzo Bank', 'Talentful Ltd', 'Barclays'])('%s is not an agency', (name) => {
    expect(isAgency(name)).toBe(false);
  });
});
