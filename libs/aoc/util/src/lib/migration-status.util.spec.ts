import { describe, expect, it } from 'vitest';

import { manualAssignCount, migrationStatus } from './migration-status.util';

describe('migrationStatus', () => {
  it('is offen while something is pending', () => {
    expect(migrationStatus({ pending: 3 })).toBe('offen');
    expect(migrationStatus({ pending: 1 })).toBe('offen');
  });

  it('is erledigt when nothing is pending', () => {
    expect(migrationStatus({ pending: 0 })).toBe('erledigt');
  });

  it('is error for an Error, never erledigt', () => {
    expect(migrationStatus(new Error('boom'))).toBe('error');
  });

  it('treats a non-finite or negative count as error rather than erledigt', () => {
    expect(migrationStatus({ pending: Number.NaN })).toBe('error');
    expect(migrationStatus({ pending: -1 })).toBe('error');
  });
});

describe('manualAssignCount', () => {
  it('names the ambiguous rooms of an erledigt migration without making it offen', () => {
    expect(migrationStatus({ pending: 0 })).toBe('erledigt');
    expect(manualAssignCount({ status: 'erledigt', ambiguous: 4 })).toBe(4);
  });

  it('is 0 without ambiguous items, without a state, and after an error', () => {
    expect(manualAssignCount({ status: 'erledigt', ambiguous: 0 })).toBe(0);
    expect(manualAssignCount({ status: 'erledigt' })).toBe(0);
    expect(manualAssignCount(undefined)).toBe(0);
    expect(manualAssignCount({ status: 'error', ambiguous: 3 })).toBe(0);
  });
});
