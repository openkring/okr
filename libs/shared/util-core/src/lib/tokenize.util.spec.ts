import { describe, expect, it } from 'vitest';

import { buildSearchTokens, deaccent } from './tokenize.util';

describe('deaccent', () => {
  it('removes German umlauts and accents', () => {
    expect(deaccent('Stäfa Zürich Genève')).toBe('Stafa Zurich Geneve');
  });
});

describe('buildSearchTokens', () => {
  it('returns empty string for undefined/empty input', () => {
    expect(buildSearchTokens(undefined)).toBe('');
    expect(buildSearchTokens('')).toBe('');
  });

  it('lowercases, deaccents and strips HTML', () => {
    expect(buildSearchTokens('<p>Zürich Regatta</p>')).toBe('zurich regatta');
  });

  it('removes stop words (German + English)', () => {
    expect(buildSearchTokens('Der Verein und the club')).toBe('verein club');
  });

  it('drops single-character tokens and de-duplicates', () => {
    expect(buildSearchTokens('a boot boot x')).toBe('boot');
  });

  it('caps the output length without leaving a partial trailing token', () => {
    const long = Array.from({ length: 400 }, (_, i) => `token${i}`).join(' ');
    const result = buildSearchTokens(long, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith(' ')).toBe(false);
    // last token is whole (no partial)
    expect(result.split(' ').every((t) => /^token\d+$/.test(t))).toBe(true);
  });
});
