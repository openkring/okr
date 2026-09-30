import { describe, expect, it } from 'vitest';

import { resetMailFields } from './index';

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
