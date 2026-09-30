import { describe, expect, it } from 'vitest';

import { isBlockedSyntheticEmailChange, isLoginEmailChange, resetMailFields } from './index';

function found(over: Record<string, unknown> = {}): { uid: string; data: Record<string, unknown> } {
  return { uid: 'uid1', data: { personKey: 'p1', loginId: 'max_mueller', ...over } };
}

describe('resetMailFields', () => {
  it('unknown Benutzername (no account found) bails out generically', () => {
    expect(resetMailFields(undefined, 'anna@example.ch')).toBeUndefined();
  });

  it('an account with no favourite email on file bails out generically', () => {
    expect(resetMailFields(found(), '')).toBeUndefined();
  });

  it('mails the favourite email, not the Auth account address', () => {
    expect(resetMailFields(found(), 'parent@example.ch')).toEqual({
      resetLoginId: 'max_mueller',
      recipients: ['parent@example.ch'],
    });
  });

  it('falls back to an empty Benutzername when the users doc has none', () => {
    expect(resetMailFields(found({ loginId: undefined }), 'anna@example.ch')).toEqual({
      resetLoginId: '',
      recipients: ['anna@example.ch'],
    });
  });
});

describe('isBlockedSyntheticEmailChange', () => {
  const synthetic = 'max_mueller@login.seeclub.org';

  it('allows an edit that keeps a synthetic email unchanged', () => {
    expect(isBlockedSyntheticEmailChange(synthetic, synthetic)).toBe(false);
    expect(isBlockedSyntheticEmailChange(synthetic, ' MAX_MUELLER@LOGIN.SEECLUB.ORG ')).toBe(false);
  });

  it('refuses to move a synthetic account to another address', () => {
    expect(isBlockedSyntheticEmailChange(synthetic, 'anna@gmail.com')).toBe(true);
    expect(isBlockedSyntheticEmailChange(synthetic, 'max_m@login.seeclub.org')).toBe(true);
  });

  it('refuses to give a real account a synthetic address', () => {
    expect(isBlockedSyntheticEmailChange('anna@gmail.com', synthetic)).toBe(true);
  });

  it('leaves real-to-real email changes alone', () => {
    expect(isBlockedSyntheticEmailChange('anna@gmail.com', 'anna@bluewin.ch')).toBe(false);
    expect(isBlockedSyntheticEmailChange(undefined, 'anna@gmail.com')).toBe(false);
  });
});

describe('isLoginEmailChange', () => {
  it('a different address is a change', () => {
    expect(isLoginEmailChange('anna@example.ch', 'anna.mueller@example.ch')).toBe(true);
  });
  it('the same address in another case or with blanks is not', () => {
    expect(isLoginEmailChange('Anna@Example.ch', ' anna@example.ch ')).toBe(false);
  });
  it('a users doc without loginEmail yet is reconciled', () => {
    expect(isLoginEmailChange('', 'anna@example.ch')).toBe(true);
    expect(isLoginEmailChange(undefined, 'anna@example.ch')).toBe(true);
  });
  it('an empty new address never overwrites', () => {
    expect(isLoginEmailChange('anna@example.ch', '')).toBe(false);
    expect(isLoginEmailChange('anna@example.ch', undefined)).toBe(false);
  });
});
