import { describe, expect, it } from 'vitest';

import { householdErrorKey, memberOptions } from './household.util';

describe('householdErrorKey', () => {
  it('maps a known refusal to its message', () => {
    expect(householdErrorKey({ code: 'functions/invalid-argument', message: 'already-in-household' })).toBe('error_already_in_household');
    expect(householdErrorKey({ code: 'functions/permission-denied', message: 'not-allowed' })).toBe('error_not_allowed');
    expect(householdErrorKey({ message: 'empty-member' })).toBe('error_empty_member');
  });

  it('falls back to the generic error', () => {
    expect(householdErrorKey(new Error('network down'))).toBe('save_error');
    expect(householdErrorKey(undefined)).toBe('save_error');
    expect(householdErrorKey({ message: 'toString' })).toBe('save_error');
  });
});

describe('memberOptions', () => {
  it('labels members by name and falls back to the key', () => {
    expect(memberOptions(['p1', 'p2'], { p1: 'Anna Muster' })).toEqual({ keys: ['p1', 'p2'], labels: ['Anna Muster', 'p2'] });
  });
});
