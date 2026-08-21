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

const WITH_NAV = `---
date: 2026-08-16
---

← [20260815diaryTodMonika](../20260815saTodMonika/20260815diaryTodMonika.md) | [x](y) →

## Persönliche Gedanken

Schlafe bis 8.

## Erledigt

- [x] Rechnungen
`;

describe('parseDiaryMarkdown — sections', () => {
  it('collects the text before the first heading as a preamble section', () => {
    const file = parseDiaryMarkdown(WITH_NAV);
    expect(file.sections[0].heading).toBe('');
    expect(file.sections[0].content).toContain('← [20260815diaryTodMonika]');
  });

  it('keeps the heading line verbatim', () => {
    const file = parseDiaryMarkdown(WITH_NAV);
    expect(file.sections.map(s => s.heading)).toEqual([
      '', '## Persönliche Gedanken', '## Erledigt',
    ]);
  });

  it('keeps the section content verbatim, trailing newlines included', () => {
    const file = parseDiaryMarkdown(WITH_NAV);
    // the content starts with the newline that terminates the heading line
    expect(file.sections[1].content).toBe('\n\nSchlafe bis 8.\n\n');
    expect(file.sections[2].content).toBe('\n\n- [x] Rechnungen\n');
  });

  it('treats a sub-heading as its own section', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-04-14\n---\n\n## Erledigt\n\n### SCS\n- Elektriker\n');
    expect(file.sections.map(s => s.heading)).toEqual(['', '## Erledigt', '### SCS']);
  });

  it('produces a single preamble section when the body has no heading', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-08-16\n---\n\nnur Text\n');
    expect(file.sections).toEqual([{ heading: '', content: '\nnur Text\n' }]);
  });
});
