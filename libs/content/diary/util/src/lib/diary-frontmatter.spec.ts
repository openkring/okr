import { describe, expect, it } from 'vitest';
import { fmList, fmNumber, fmScalar } from './diary-frontmatter';
import { parseDiaryMarkdown } from './diary-parse';

const FILE = parseDiaryMarkdown(`---
tags:
  - diary
  - reise
date: 2026-08-16
title: Schulanfang
weather: "☁️ 22–32°C, 0 mm"
weather_min: 21.8
weather_precip: 0.0
people: [anna, bruno]
places: []
---

## Persönliche Gedanken

Text.
`);

describe('frontmatter accessors', () => {
  it('strips the leading space from a scalar', () => {
    expect(fmScalar(FILE, 'title')).toBe('Schulanfang');
    expect(fmScalar(FILE, 'date')).toBe('2026-08-16');
  });

  it('strips surrounding double quotes from a scalar', () => {
    expect(fmScalar(FILE, 'weather')).toBe('☁️ 22–32°C, 0 mm');
  });

  it('returns an empty string for a missing key', () => {
    expect(fmScalar(FILE, 'location')).toBe('');
  });

  it('reads numbers, including a zero written as 0.0', () => {
    expect(fmNumber(FILE, 'weather_min')).toBe(21.8);
    expect(fmNumber(FILE, 'weather_precip')).toBe(0);
    expect(fmNumber(FILE, 'missing')).toBeUndefined();
  });

  it('reads an inline list', () => {
    expect(fmList(FILE, 'people')).toEqual(['anna', 'bruno']);
  });

  it('reads an empty inline list as an empty array', () => {
    expect(fmList(FILE, 'places')).toEqual([]);
  });

  it('reads a block list', () => {
    expect(fmList(FILE, 'tags')).toEqual(['diary', 'reise']);
  });

  it('returns an empty array for a missing list', () => {
    expect(fmList(FILE, 'events')).toEqual([]);
  });
});
