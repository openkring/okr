import { describe, it, expect } from 'vitest';
import { normalizeWhitespace, normalizeForCompare, hasValidCoordinates } from './location-select.store';

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

describe('hasValidCoordinates', () => {
  it('returns false for (0, 0) null island', () => {
    expect(hasValidCoordinates({ latitude: 0, longitude: 0 } as any)).toBe(false);
  });
  it('returns false for NaN latitude', () => {
    expect(hasValidCoordinates({ latitude: NaN, longitude: 8.5 } as any)).toBe(false);
  });
  it('returns false for latitude > 90', () => {
    expect(hasValidCoordinates({ latitude: 91, longitude: 8.5 } as any)).toBe(false);
  });
  it('returns false for longitude > 180', () => {
    expect(hasValidCoordinates({ latitude: 47.4, longitude: 181 } as any)).toBe(false);
  });
  it('returns true for valid Swiss coordinates', () => {
    expect(hasValidCoordinates({ latitude: 47.3769, longitude: 8.5417 } as any)).toBe(true);
  });
  it('returns true for edge values ±90/±180', () => {
    expect(hasValidCoordinates({ latitude: 90, longitude: 180 } as any)).toBe(true);
  });
});
