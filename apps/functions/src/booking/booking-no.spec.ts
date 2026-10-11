import { describe, expect, it } from 'vitest';

import { bookingYearRange } from './booking-no';

describe('bookingYearRange', () => {
  const inRange = (date: string, year: number) => {
    const { from, to } = bookingYearRange(year);
    return date >= from && date < to;
  };

  it('holds every StoreDate of the year, first and last day included', () => {
    expect(inRange('20260101', 2026)).toBe(true);
    expect(inRange('20261231', 2026)).toBe(true);
    expect(inRange('202612312359', 2026)).toBe(true);
  });

  it('excludes the neighbouring years and undated bookings', () => {
    expect(inRange('20251231', 2026)).toBe(false);
    expect(inRange('20270101', 2026)).toBe(false);
    expect(inRange('', 2026)).toBe(false);
  });
});
