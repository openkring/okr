import { describe, it, expect } from 'vitest';
import { validateIban, normalizeIban } from './iban.util';

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    expect(normalizeIban('ch93 0076 2011 6238 5295 7')).toBe('CH9300762011623852957');
  });
});

describe('validateIban', () => {
  it('returns true for a valid Swiss IBAN', () => {
    expect(validateIban('CH9300762011623852957')).toBe(true);
  });

  it('returns true for IBAN with spaces', () => {
    expect(validateIban('CH93 0076 2011 6238 5295 7')).toBe(true);
  });

  it('returns false for an invalid IBAN', () => {
    expect(validateIban('CH0000000000000000000')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateIban('')).toBe(false);
  });

  it('returns false for non-IBAN string', () => {
    expect(validateIban('not-an-iban')).toBe(false);
  });
});
