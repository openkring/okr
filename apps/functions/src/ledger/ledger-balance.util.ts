// apps/functions/src/ledger/ledger-balance.util.ts
//
// Pure rules of the ledger-balance refresh (spec 1.177 §6.2): which annual periods cover a calendar year, the lock
// fingerprint, which stored years may be reused, and whether the stored counts still match the ledger.

import { LEDGER_BALANCE_VERSION } from '@okr/shared-models';

export interface PeriodLike { okey: string; month?: number; isLocked?: boolean; lockedAt?: string }
export interface StoredYear { year: number; version?: number; locks?: string; bookingCount?: number; lineCount?: number; cells?: unknown[]; bookingCounts?: number[] }

/** The annual period okeys whose fiscal years together cover every day of `calendarYear`. */
export function coveringPeriodKeys(accountingTenantId: string, calendarYear: number, fiscalYearStart: number): string[] {
  const start = fiscalYearStart >= 1 && fiscalYearStart <= 12 ? fiscalYearStart : 1;
  return start === 1
    ? [`${accountingTenantId}-${calendarYear}`]
    : [`${accountingTenantId}-${calendarYear - 1}`, `${accountingTenantId}-${calendarYear}`];
}

/**
 * `{periodKey}:{lockedAt}` of the covering annual periods, sorted and joined; '' unless every one of them exists and is
 * locked. Monthly locks never count: the write doors check annual periods only. A lock released and set again gets a
 * new `lockedAt`, so the fingerprint changes and the year is recomputed once.
 */
export function lockFingerprint(accountingTenantId: string, calendarYear: number, fiscalYearStart: number, periods: Map<string, PeriodLike>): string {
  if (calendarYear <= 0) return '';
  const parts: string[] = [];
  for (const key of coveringPeriodKeys(accountingTenantId, calendarYear, fiscalYearStart)) {
    const p = periods.get(key);
    if (!p || p.isLocked !== true || (p.month ?? 0) !== 0) return '';
    parts.push(`${key}:${p.lockedAt ?? ''}`);
  }
  return parts.sort().join('|');
}

/** A stored year is reused when its format is current and it was computed under the same, still standing locks. */
export function isReusable(stored: StoredYear, fingerprint: string): boolean {
  return stored.year > 0 && stored.version === LEDGER_BALANCE_VERSION && !!stored.locks && stored.locks === fingerprint;
}

/** The years to recompute in a partial refresh: every stored year not reused, the current year and the undated one. */
export function yearsToRecompute(stored: StoredYear[], reused: Set<number>, currentYear: number): number[] {
  const years = new Set<number>([0, currentYear, ...stored.map(s => s.year)]);
  return [...years].filter(y => !reused.has(y)).sort((a, b) => a - b);
}

/** Σ bookingCount and Σ lineCount of the year documents, to compare with `count()` of the ledger. */
export function countTotals(years: { bookingCount?: number; lineCount?: number }[]): { bookings: number; lines: number } {
  return years.reduce((t, y) => ({ bookings: t.bookings + (y.bookingCount ?? 0), lines: t.lines + (y.lineCount ?? 0) }), { bookings: 0, lines: 0 });
}

/** Whether two year documents hold the same figures (cells and counts), for the weekly check of locked years. */
export function sameFigures(a: StoredYear, b: StoredYear): boolean {
  return JSON.stringify([a.cells ?? [], a.bookingCounts ?? [], a.bookingCount ?? 0, a.lineCount ?? 0])
    === JSON.stringify([b.cells ?? [], b.bookingCounts ?? [], b.bookingCount ?? 0, b.lineCount ?? 0]);
}

/** A stored document is only overwritten by a snapshot at least as new (two refreshes at once). */
export function mayOverwrite(storedComputedAt: string | undefined, computedAt: string): boolean {
  return !storedComputedAt || storedComputedAt <= computedAt;
}

/** StoreDateTime (yyyyMMddHHmmss) of an instant, on the Zurich wall clock. */
export function storeDateTimeInZurich(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string): string => parts.find(p => p.type === type)?.value ?? '00';
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`;
}

/**
 * Balances are only kept for books of exactly one tenant. A document of books shared by two tenants would sum both
 * tenants' bookings and be readable by either, while their own queries only ever see their own bookings.
 */
export function isSingleTenantBooks(tenants: string[]): boolean {
  return tenants.length === 1;
}
