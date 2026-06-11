import { describe, it, expect } from 'vitest';
import { normalizeWhitespace, normalizeForCompare } from './location-select.store';

describe('normalizeWhitespace', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  Hallo  ')).toBe('Hallo');
  });
  it('collapses multiple spaces to one', () => {
    expect(normalizeWhitespace('Brünishusen  via   Insel ')).toBe('Brünishusen via Insel');
  });
  it('preserves original casing', () => {
    expect(normalizeWhitespace('ABC def')).toBe('ABC def');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeWhitespace('   ')).toBe('');
  });
});

describe('normalizeForCompare', () => {
  it('lowercases input', () => {
    expect(normalizeForCompare('ABC')).toBe('abc');
  });
  it('collapses whitespace AND lowercases', () => {
    expect(normalizeForCompare('  Brünishusen  Via  Insel ')).toBe('brünishusen via insel');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeForCompare('   ')).toBe('');
  });
});
