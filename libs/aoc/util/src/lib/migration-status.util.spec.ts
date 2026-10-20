import { describe, expect, it } from 'vitest';

import { migrationStatus } from './migration-status.util';

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
