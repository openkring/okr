import { describe, expect, it } from 'vitest';
import { touchedPeriodKeys } from './period-lock';

describe('touchedPeriodKeys', () => {
  it('maps a date to its annual period', () => {
    expect(touchedPeriodKeys('scs', ['20250314'], 1)).toEqual(['scs-2025']);
  });

  it('lists both periods when a booking moves between years, once each', () => {
    expect(touchedPeriodKeys('scs', ['20260105', '20251231'], 1)).toEqual(['scs-2026', 'scs-2025']);
    expect(touchedPeriodKeys('scs', ['20250105', '20250630'], 1)).toEqual(['scs-2025']);
  });

  it('follows a fiscal year that does not start in January', () => {
    expect(touchedPeriodKeys('gss', ['20260315'], 7)).toEqual(['gss-2025']);
    expect(touchedPeriodKeys('gss', ['20260715'], 7)).toEqual(['gss-2026']);
  });

  it('skips missing or malformed dates', () => {
    expect(touchedPeriodKeys('scs', [undefined, '', '2025-03-14', '20250314'], 1)).toEqual(['scs-2025']);
  });
});
