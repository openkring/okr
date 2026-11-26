import { describe, expect, it } from 'vitest';

import { LEDGER_BALANCE_VERSION } from '@okr/shared-models';

import {
  countTotals, coveringPeriodKeys, isReusable, lockFingerprint, mayOverwrite, PeriodLike, sameFigures, storeDateTimeInZurich, yearsToRecompute,
} from './ledger-balance.util';
import { booksOf, isSundayInZurich } from './ledger-books';
import { isLedgerReader } from './index';

const periods = (...ps: PeriodLike[]): Map<string, PeriodLike> => new Map(ps.map(p => [p.okey, p]));
const locked = (okey: string, lockedAt = '20260115'): PeriodLike => ({ okey, month: 0, isLocked: true, lockedAt });

describe('ledger balance refresh rules', () => {
  it('covers a calendar year with one annual period, or two for a fiscal year from July', () => {
    expect(coveringPeriodKeys('scs', 2025, 1)).toEqual(['scs-2025']);
    expect(coveringPeriodKeys('gss', 2025, 7)).toEqual(['gss-2024', 'gss-2025']);
  });

  it('fingerprints only when every covering annual period is locked', () => {
    expect(lockFingerprint('scs', 2025, 1, periods(locked('scs-2025')))).toBe('scs-2025:20260115');
    expect(lockFingerprint('scs', 2025, 1, periods({ okey: 'scs-2025', month: 0, isLocked: false }))).toBe('');
    expect(lockFingerprint('scs', 2025, 1, periods())).toBe('');
    expect(lockFingerprint('gss', 2025, 7, periods(locked('gss-2025')))).toBe('');
    expect(lockFingerprint('gss', 2025, 7, periods(locked('gss-2025'), locked('gss-2024', '20250801')))).toBe('gss-2024:20250801|gss-2025:20260115');
    expect(lockFingerprint('scs', 0, 1, periods(locked('scs-0')))).toBe('');
  });

  it('never counts a monthly lock', () => {
    expect(lockFingerprint('scs', 2025, 1, periods({ okey: 'scs-2025', month: 3, isLocked: true, lockedAt: '20250401' }))).toBe('');
  });

  it('reuses a year only with the current format and the same standing locks', () => {
    const stored = { year: 2025, version: LEDGER_BALANCE_VERSION, locks: 'scs-2025:20260115' };
    expect(isReusable(stored, 'scs-2025:20260115')).toBe(true);
    expect(isReusable(stored, 'scs-2025:20260301')).toBe(false);            // unlocked and locked again
    expect(isReusable(stored, '')).toBe(false);                              // unlocked
    expect(isReusable({ ...stored, locks: '' }, '')).toBe(false);            // computed while open
    expect(isReusable({ ...stored, version: 0 }, 'scs-2025:20260115')).toBe(false);
    expect(isReusable({ ...stored, year: 0 }, 'scs-2025:20260115')).toBe(false);
  });

  it('recomputes every stored year not reused, plus the current and the undated year', () => {
    const stored = [{ year: 2024 }, { year: 2025 }, { year: 2026 }];
    expect(yearsToRecompute(stored, new Set([2024, 2025]), 2026)).toEqual([0, 2026]);
    expect(yearsToRecompute(stored, new Set([2024]), 2027)).toEqual([0, 2025, 2026, 2027]);
  });

  it('sums the counts of the year documents', () => {
    expect(countTotals([{ bookingCount: 3, lineCount: 6 }, { bookingCount: 1, lineCount: 2 }, {}])).toEqual({ bookings: 4, lines: 8 });
  });

  it('compares the figures of two year documents', () => {
    const a = { year: 2025, cells: [{ m: 1 }], bookingCounts: [1], bookingCount: 1, lineCount: 2 };
    expect(sameFigures(a, { ...a, locks: 'x' } as never)).toBe(true);
    expect(sameFigures(a, { ...a, lineCount: 3 })).toBe(false);
  });

  it('never overwrites a newer snapshot', () => {
    expect(mayOverwrite(undefined, '20261126100000')).toBe(true);
    expect(mayOverwrite('20261126100000', '20261126100000')).toBe(true);
    expect(mayOverwrite('20261126100001', '20261126100000')).toBe(false);
  });

  it('writes the Zurich wall clock', () => {
    expect(storeDateTimeInZurich(new Date('2026-11-26T09:15:30Z'))).toBe('20261126101530');   // CET
    expect(storeDateTimeInZurich(new Date('2026-07-01T22:00:00Z'))).toBe('20260702000000');   // CEST
  });

  it('knows Sunday in Zurich', () => {
    expect(isSundayInZurich(new Date('2026-11-29T02:15:00Z'))).toBe(true);
    expect(isSundayInZurich(new Date('2026-11-28T22:59:00Z'))).toBe(false);
  });
});

describe('ledger callable guards', () => {
  it('lets ledger readers through only', () => {
    for (const role of ['treasurer', 'admin', 'privileged', 'auditor']) expect(isLedgerReader({ [role]: true })).toBe(true);
    expect(isLedgerReader({ member: true })).toBe(false);
    expect(isLedgerReader(undefined)).toBe(false);
  });

  it('scopes the books by their config, and rebuilds bexio books in full', () => {
    expect(booksOf('gss', { tenants: ['scs'], fiscalYearStart: 7 })).toEqual({ books: { accountingTenantId: 'gss', tenants: ['scs'], fiscalYearStart: 7 }, alwaysFull: false });
    expect(booksOf('scs', { tenants: ['scs', 7, ''], accountingBackend: 'bexio' }).alwaysFull).toBe(true);
    expect(booksOf('scs', { tenants: ['scs'] }).books.fiscalYearStart).toBe(1);
  });
});
