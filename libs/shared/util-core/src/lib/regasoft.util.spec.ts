import { describe, expect, it } from 'vitest';

import { SrvIndex } from '@okr/shared-models';

import { getMismatches } from './regasoft.util';

/**
 * SrvIndex with every field neutral; overrides drive the case under test.
 * `rid` must be truthy (getMismatches short-circuits to [] otherwise, since an
 * empty `rid` means "no linked Regasoft record").
 */
function srvIndex(overrides: Partial<SrvIndex> = {}): SrvIndex {
  return { ...({} as SrvIndex), rid: '1', dateOfBirth: '', rDateOfBirth: '', ...overrides };
}

describe('getMismatches dateOfBirth', () => {
  it('does not report a mismatch when the local birth date is year-only', () => {
    const item = srvIndex({ dateOfBirth: '19850000', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });

  it('does not report a mismatch when the local birth date has no year', () => {
    const item = srvIndex({ dateOfBirth: '00000415', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });

  it('still reports a mismatch between two full birth dates', () => {
    const item = srvIndex({ dateOfBirth: '19850415', rDateOfBirth: '19860415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeDefined();
  });

  it('reports nothing when the two full dates agree', () => {
    const item = srvIndex({ dateOfBirth: '19850415', rDateOfBirth: '19850415' });
    expect(getMismatches(item).find(m => m.field === 'dateOfBirth')).toBeUndefined();
  });
});
