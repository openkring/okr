import { describe, expect, it } from 'vitest';
import {
  isLoginIdInput, isSyntheticLoginEmail, isValidLoginId, loginDomainFromAppDomain, loginIdFromSyntheticEmail,
  nextFreeLoginId, normalizeLoginIdInput, proposeLoginIdBase, syntheticLoginEmail,
} from './login-id.util';

describe('proposeLoginIdBase', () => {
  it('joins first and last name with an underscore, lowercase', () => {
    expect(proposeLoginIdBase('Max', 'Müller')).toBe('max_mueller');
  });
  it('folds umlauts and ß, strips other diacritics', () => {
    expect(proposeLoginIdBase('Jürg', 'Weiß')).toBe('juerg_weiss');
    expect(proposeLoginIdBase('Zoë', 'Brontë-Côté')).toBe('zoe_bronte-cote');
    expect(proposeLoginIdBase('ÄNNI', 'Öz')).toBe('aenni_oez');
  });
  it('removes spaces and apostrophes, keeps hyphens', () => {
    expect(proposeLoginIdBase('Anna-Lena', 'von Allmen')).toBe('anna-lena_vonallmen');
    expect(proposeLoginIdBase('Sean', "O'Brien")).toBe('sean_obrien');
  });
  it('drops characters outside [a-z0-9_.-]', () => {
    expect(proposeLoginIdBase('Max (Junior)', 'Müller!')).toBe('maxjunior_mueller');
  });
  it('falls back to "mitglied" when the names yield fewer than 3 characters', () => {
    expect(proposeLoginIdBase('', '')).toBe('mitglied');
    expect(proposeLoginIdBase('李', '')).toBe('mitglied');
  });
  it('uses the one name that exists without a dangling underscore', () => {
    expect(proposeLoginIdBase('', 'Müller')).toBe('mueller');
  });
  it('caps at 38 characters so a digit suffix still fits', () => {
    expect(proposeLoginIdBase('a'.repeat(30), 'b'.repeat(30)).length).toBe(38);
  });
});

describe('nextFreeLoginId', () => {
  it('returns the base when free', () => {
    expect(nextFreeLoginId('max_mueller', new Set())).toBe('max_mueller');
  });
  it('appends 2, 3, … on collision', () => {
    expect(nextFreeLoginId('max_mueller', new Set(['max_mueller']))).toBe('max_mueller2');
    expect(nextFreeLoginId('max_mueller', new Set(['max_mueller', 'max_mueller2']))).toBe('max_mueller3');
  });
  it('never exceeds 40 characters', () => {
    const base = 'x'.repeat(40);
    expect(nextFreeLoginId(base, new Set([base])).length).toBeLessThanOrEqual(40);
  });
});

describe('normalizeLoginIdInput / isValidLoginId / isLoginIdInput', () => {
  it('trims and lowercases', () => {
    expect(normalizeLoginIdInput('  Max_Mueller ')).toBe('max_mueller');
  });
  it('accepts the allowed alphabet and length', () => {
    expect(isValidLoginId('max_mueller')).toBe(true);
    expect(isValidLoginId('a.b-c_1')).toBe(true);
    expect(isValidLoginId('ab')).toBe(false);
    expect(isValidLoginId('x'.repeat(41))).toBe(false);
    expect(isValidLoginId('max@mueller')).toBe(false);
    expect(isValidLoginId('Max')).toBe(false);
  });
  it('treats input without @ as a Benutzername', () => {
    expect(isLoginIdInput('max_mueller')).toBe(true);
    expect(isLoginIdInput('anna@gmail.com')).toBe(false);
    expect(isLoginIdInput('')).toBe(false);
  });
});

describe('synthetic login email', () => {
  it('drops a leading app. from the app domain', () => {
    expect(loginDomainFromAppDomain('app.seeclub.org')).toBe('seeclub.org');
    expect(loginDomainFromAppDomain('seeclub.org')).toBe('seeclub.org');
  });
  it('builds and recognises the synthetic address', () => {
    const email = syntheticLoginEmail('max_mueller', 'app.seeclub.org');
    expect(email).toBe('max_mueller@login.seeclub.org');
    expect(isSyntheticLoginEmail(email)).toBe(true);
    expect(isSyntheticLoginEmail('MAX@LOGIN.SEECLUB.ORG')).toBe(true);
    expect(isSyntheticLoginEmail('anna@gmail.com')).toBe(false);
    expect(isSyntheticLoginEmail('anna@login-service.ch')).toBe(false);
    expect(isSyntheticLoginEmail(undefined)).toBe(false);
  });
  it('extracts the Benutzername from a synthetic address only', () => {
    expect(loginIdFromSyntheticEmail('max_mueller@login.seeclub.org')).toBe('max_mueller');
    expect(loginIdFromSyntheticEmail('anna@gmail.com')).toBe('');
  });
});
