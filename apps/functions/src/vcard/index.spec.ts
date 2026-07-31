import { describe, expect, it } from 'vitest';
import { resolveBdayIso } from './index';

describe('resolveBdayIso', () => {
  it('converts a full dob StoreDate to an ISO date', () => {
    expect(resolveBdayIso('19850415')).toBe('1985-04-15');
  });

  it('returns undefined for an empty/undefined dob', () => {
    expect(resolveBdayIso(undefined)).toBeUndefined();
    expect(resolveBdayIso('')).toBeUndefined();
  });

  // The primary motivating case for this feature: imported legacy member lists carry a year
  // and nothing more. Regression for the CRITICAL finding — this used to throw
  // RangeError: Invalid time value and fail the whole vcardExport batch for ONE such person.
  it('omits BDAY (does not throw) for a year-only dob', () => {
    expect(() => resolveBdayIso('19850000')).not.toThrow();
    expect(resolveBdayIso('19850000')).toBeUndefined();
  });

  it('omits BDAY (does not throw) for a birthday without a year', () => {
    expect(() => resolveBdayIso('00000415')).not.toThrow();
    expect(resolveBdayIso('00000415')).toBeUndefined();
  });
});
