import { describe, expect, it } from 'vitest';

import { nextHasAccount } from './account-mirror.decide';

describe('nextHasAccount', () => {
  it('sets hasAccount when a user document is created', () => {
    expect(nextHasAccount(undefined, { personKey: 'p1' })).toEqual([{ personKey: 'p1', hasAccount: true }]);
  });

  it('clears hasAccount when the user document is deleted', () => {
    expect(nextHasAccount({ personKey: 'p1' }, undefined)).toEqual([{ personKey: 'p1', hasAccount: false }]);
  });

  it('moves the flag when the account is re-linked to another person', () => {
    expect(nextHasAccount({ personKey: 'p1' }, { personKey: 'p2' })).toEqual([
      { personKey: 'p1', hasAccount: false },
      { personKey: 'p2', hasAccount: true },
    ]);
  });

  it('does nothing when the personKey is unchanged', () => {
    expect(nextHasAccount({ personKey: 'p1' }, { personKey: 'p1' })).toEqual([]);
  });

  it('ignores an empty personKey on either side', () => {
    expect(nextHasAccount(undefined, { personKey: '' })).toEqual([]);
    expect(nextHasAccount({ personKey: '' }, undefined)).toEqual([]);
  });

  it('ignores a user document that never carried a personKey', () => {
    expect(nextHasAccount({}, {})).toEqual([]);
  });
});
