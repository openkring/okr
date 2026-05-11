import { describe, it, expect } from 'vitest';
import {
  storeDateToIso, locationName, parseTags, mapCategory, titleToI18n
} from './utils';

describe('storeDateToIso', () => {
  it('converts valid storeDate', () => {
    expect(storeDateToIso('20260521')).toBe('2026-05-21');
  });
  it('returns empty string for empty input', () => {
    expect(storeDateToIso('')).toBe('');
  });
  it('returns empty string for wrong length', () => {
    expect(storeDateToIso('2026052')).toBe('');
  });
});

describe('locationName', () => {
  it('extracts name before @', () => {
    expect(locationName('Bootshaus Stäfa@abc123')).toBe('Bootshaus Stäfa');
  });
  it('returns input if no @', () => {
    expect(locationName('Bootshaus')).toBe('Bootshaus');
  });
  it('returns empty string for empty input', () => {
    expect(locationName('')).toBe('');
  });
});

describe('parseTags', () => {
  it('splits comma-separated tags', () => {
    expect(parseTags('regatta,erfolg')).toEqual(['regatta', 'erfolg']);
  });
  it('trims whitespace', () => {
    expect(parseTags('regatta, erfolg ')).toEqual(['regatta', 'erfolg']);
  });
  it('returns [] for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });
});

describe('titleToI18n', () => {
  it('returns titleI18n when present', () => {
    expect(titleToI18n('DE', { de: 'DE', en: 'EN' })).toEqual({ de: 'DE', en: 'EN' });
  });
  it('wraps plain title in de key when titleI18n is absent', () => {
    expect(titleToI18n('Hallo')).toEqual({ de: 'Hallo' });
  });
  it('wraps when titleI18n is empty object', () => {
    expect(titleToI18n('Hallo', {})).toEqual({ de: 'Hallo' });
  });
});

describe('mapCategory', () => {
  it('passes through known types', () => {
    expect(mapCategory('regatta')).toBe('regatta');
  });
  it('passes through unknown types as-is', () => {
    expect(mapCategory('social')).toBe('social');
  });
});
