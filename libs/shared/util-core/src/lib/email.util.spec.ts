import { describe, expect, it } from 'vitest';

import { needsEmailNormalization, normalizeEmail, parseEmailList } from './email.util';

describe('normalizeEmail', () => {
  it('returns a bare address unchanged (trimmed)', () => {
    expect(normalizeEmail('  max@muster.ch ')).toBe('max@muster.ch');
  });

  it('strips the display name', () => {
    expect(normalizeEmail('Max Muster <max@muster.ch>')).toBe('max@muster.ch');
    expect(normalizeEmail('"Muster, Max" <max@muster.ch>')).toBe('max@muster.ch');
    expect(normalizeEmail('<max@muster.ch>')).toBe('max@muster.ch');
  });

  it('strips mailto and its query', () => {
    expect(normalizeEmail('mailto:max@muster.ch')).toBe('max@muster.ch');
    expect(normalizeEmail('MAILTO:max@muster.ch?subject=Hallo')).toBe('max@muster.ch');
    expect(normalizeEmail('mailto:max%40muster.ch')).toBe('max@muster.ch');
    expect(normalizeEmail('Max <mailto:max@muster.ch>')).toBe('max@muster.ch');
  });

  it('keeps partial input while typing', () => {
    expect(normalizeEmail('Max <max@mus')).toBe('Max <max@mus');
    expect(normalizeEmail('max_mueller')).toBe('max_mueller');
  });

  it('handles empty values', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
  });
});

describe('parseEmailList', () => {
  it('splits on comma and semicolon', () => {
    expect(parseEmailList('a@x.ch, b@x.ch ;c@x.ch')).toEqual(['a@x.ch', 'b@x.ch', 'c@x.ch']);
  });

  it('keeps quoted display names with commas together', () => {
    expect(parseEmailList('"Muster, Max" <max@muster.ch>, Eva <eva@x.ch>, mailto:a@x.ch'))
      .toEqual(['max@muster.ch', 'eva@x.ch', 'a@x.ch']);
  });

  it('drops empty entries', () => {
    expect(parseEmailList(' , a@x.ch,,')).toEqual(['a@x.ch']);
    expect(parseEmailList('')).toEqual([]);
  });
});

describe('needsEmailNormalization', () => {
  it('detects display-name and mailto forms', () => {
    expect(needsEmailNormalization('Max <max@muster.ch>')).toBe(true);
    expect(needsEmailNormalization('mailto:max@muster.ch')).toBe(true);
    expect(needsEmailNormalization('max@muster.ch, b@x.ch')).toBe(false);
    expect(needsEmailNormalization('Max <max@mus')).toBe(false);
  });
});
