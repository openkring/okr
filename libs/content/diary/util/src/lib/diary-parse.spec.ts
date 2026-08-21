import { describe, expect, it } from 'vitest';
import { parseDiaryMarkdown } from './diary-parse';

const FILE = `---
tags:
  - diary
date: 2026-08-16
status: final
location: Stäfa ZH
weather: "☁️ 22–32°C, 0 mm"
weather_min: 21.8
people: [barbara, saskia]
events: []
---

## Persönliche Gedanken

Schlafe bis 8.
`;

describe('parseDiaryMarkdown — frontmatter', () => {
  it('keeps the keys in file order', () => {
    const file = parseDiaryMarkdown(FILE);
    expect(file.frontmatter.map(e => e.key)).toEqual([
      'tags', 'date', 'status', 'location', 'weather', 'weather_min', 'people', 'events',
    ]);
  });

  it('keeps each value verbatim, including the leading space and the quotes', () => {
    const file = parseDiaryMarkdown(FILE);
    const byKey = (k: string) => file.frontmatter.find(e => e.key === k)?.raw;
    expect(byKey('date')).toBe(' 2026-08-16');
    expect(byKey('weather')).toBe(' "☁️ 22–32°C, 0 mm"');
    expect(byKey('people')).toBe(' [barbara, saskia]');
    expect(byKey('events')).toBe(' []');
  });

  it('folds a block list into the raw value of its key', () => {
    const file = parseDiaryMarkdown(FILE);
    expect(file.frontmatter.find(e => e.key === 'tags')?.raw).toBe('\n  - diary');
  });

  it('returns an empty frontmatter for a file without one', () => {
    const file = parseDiaryMarkdown('just text\n');
    expect(file.frontmatter).toEqual([]);
  });
});
