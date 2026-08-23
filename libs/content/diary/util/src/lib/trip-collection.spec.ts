import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTripCollection } from './trip-collection';

/** Invented fixture — the corpus is personal data and never enters the repo. */
const FIXTURE = `---
type: collection
kind: trip
title: Beispielreise
span: 2020-01-03..2020-01-04
query: trip == 20200100beispiel
people: [ada, bob]
---

# Beispielreise

Text.
`;

describe('parseTripCollection', () => {
  it('reads the slug, title, both dates and the people slugs', () => {
    const t = parseTripCollection('20200100beispiel.md', FIXTURE);
    expect(t).toEqual({
      slug: '20200100beispiel',
      title: 'Beispielreise',
      startDate: '2020-01-03',
      endDate: '2020-01-04',
      people: ['ada', 'bob'],
    });
  });

  it('rejects a file whose name disagrees with the query slug', () => {
    // The two are redundant on purpose: a renamed file that still carries the old query would
    // otherwise import under one id and be looked up under another.
    expect(() => parseTripCollection('20200100anders.md', FIXTURE)).toThrow(/slug/i);
  });

  it('rejects a span that is not two ISO dates', () => {
    expect(() => parseTripCollection('20200100beispiel.md', FIXTURE.replace('2020-01-03..2020-01-04', '2020-01-03')))
      .toThrow(/span/i);
  });

  it('rejects a file that is not a trip collection', () => {
    expect(() => parseTripCollection('20200100beispiel.md', FIXTURE.replace('kind: trip', 'kind: person')))
      .toThrow(/kind/i);
  });

  it('accepts an empty people list', () => {
    const t = parseTripCollection('20200100beispiel.md', FIXTURE.replace('people: [ada, bob]', 'people: []'));
    expect(t.people).toEqual([]);
  });
});

const TRIPS = process.env['DIARY_ARCHIVE'] ? join(process.env['DIARY_ARCHIVE'], '../collections/trips') : '';

describe.skipIf(TRIPS === '')('parseTripCollection against the real collection', () => {
  it('parses all 39 files and yields unique slugs and ordered dates', () => {
    const files = readdirSync(TRIPS).filter((f) => f.endsWith('.md'));
    expect(files.length).toBe(39);           // a guard against a wrong path passing silently
    const slugs = new Set<string>();
    for (const f of files) {
      const t = parseTripCollection(f, readFileSync(join(TRIPS, f), 'utf8'));
      expect(t.title, `${f} has no title`).not.toBe('');
      expect(t.startDate <= t.endDate, `${f} ends before it starts`).toBe(true);
      slugs.add(t.slug);
    }
    expect(slugs.size).toBe(39);
  });
});
