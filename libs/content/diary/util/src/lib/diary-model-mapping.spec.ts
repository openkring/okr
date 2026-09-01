import { AvatarInfo } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { DiaryResolver, toDiaryModel } from './diary-model-mapping';
import { parseDiaryMarkdown } from './diary-parse';
import { DIARY_FIXTURES } from './fixtures/diary-fixtures';

const fixture = (name: string): string => {
  const found = DIARY_FIXTURES.find(f => f.name === name);
  if (!found) {
    throw new Error(`unknown fixture: ${name}`);
  }
  return found.text;
};

const avatar = (key: string, name1: string): AvatarInfo => ({
  key, name1, name2: '', modelType: 'person', type: '', subType: '', label: name1,
});

const RESOLVER: DiaryResolver = {
  resolvePerson: slug => (slug === 'anna' ? avatar('p1', 'Anna') : undefined),
  resolveLocation: label =>
    label === 'Musterdorf ZH'
      ? { ...avatar('l1', 'Musterdorf'), modelType: 'location' }
      : undefined,
  resolveTrip: slug => (slug === '20250600beispielreise' ? 't1' : ''),
};

const FILE = parseDiaryMarkdown(`---
tags:
  - diary
date: 2026-08-16
status: final
title: Schulanfang
location: Musterdorf ZH
weather: "☁️ 22–32°C, 0 mm"
weather_min: 21.8
weather_max: 31.7
weather_precip: 0.0
sunrise: "06:23"
sunset: "20:35"
people: [anna, zora]
places: [musterdorf]
events: [sommerfest]
trip: 20250600beispielreise
---

## Persönliche Gedanken

Erster Absatz.

Zweiter Absatz.

## Erledigt

- [x] Erste Aufgabe
- [x] Zweite Aufgabe
`);

describe('toDiaryModel', () => {
  it('converts the ISO date of the file to the store format', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).date).toBe('20260816');
  });

  it('resolves known persons and keeps unknown ones as labels', () => {
    const model = toDiaryModel(FILE, 'bka', 'uid1', RESOLVER);
    expect(model.people.map(p => p.key)).toEqual(['p1']);
    expect(model.customPeopleLabels).toEqual(['zora']);
  });

  it('resolves a known location and leaves the custom label empty', () => {
    const model = toDiaryModel(FILE, 'bka', 'uid1', RESOLVER);
    expect(model.location?.key).toBe('l1');
    expect(model.customLocationLabel).toBe('');
  });

  it('falls back to the custom label for an unknown location', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-08-16\nlocation: Irgendwo\n---\n\n## Persönliche Gedanken\n\nx\n');
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.location).toBeUndefined();
    expect(model.customLocationLabel).toBe('Irgendwo');
  });

  it('takes the body from the Persönliche Gedanken section, trimmed', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).text).toBe('Erster Absatz.\n\nZweiter Absatz.');
  });

  it('takes the done items from the Erledigt section', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).done).toEqual(['Erste Aufgabe', 'Zweite Aufgabe']);
  });

  it('maps status active to draft and final to final', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).status).toBe('final');
    const active = parseDiaryMarkdown('---\ndate: 2026-08-16\nstatus: active\n---\n\n## Persönliche Gedanken\n\nx\n');
    expect(toDiaryModel(active, 'bka', 'uid1', RESOLVER).status).toBe('draft');
  });

  it('carries the weather over as numbers', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).weather).toEqual({
      code: -1, min: 21.8, max: 31.7, precip: 0, sunrise: '06:23', sunset: '20:35',
    });
  });

  it('resolves the trip slug to a key', () => {
    expect(toDiaryModel(FILE, 'bka', 'uid1', RESOLVER).tripKey).toBe('t1');
  });

  it('stamps tenant and author', () => {
    const model = toDiaryModel(FILE, 'bka', 'uid1', RESOLVER);
    expect(model.tenants).toEqual(['bka']);
    expect(model.authorKey).toBe('uid1');
  });

  it('leaves the date empty instead of throwing when the key is missing', () => {
    const file = parseDiaryMarkdown('---\nstatus: final\n---\n\n## Persönliche Gedanken\n\nx\n');
    expect(toDiaryModel(file, 'bka', 'uid1', RESOLVER).date).toBe('');
  });

  it('leaves the date empty instead of throwing when the value is unparseable', () => {
    const file = parseDiaryMarkdown('---\ndate: 16.08.2026\n---\n\n## Persönliche Gedanken\n\nx\n');
    expect(toDiaryModel(file, 'bka', 'uid1', RESOLVER).date).toBe('');
  });

  it('keeps a sub-heading inside the thoughts section, with the text that follows it', () => {
    const file = parseDiaryMarkdown(
      '---\ndate: 2026-08-16\n---\n\n## Persönliche Gedanken\n\nVorher.\n\n### Unterkapitel\n\nNachher.\n\n## Erledigt\n\n- [x] Aufgabe\n'
    );
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.text).toBe('Vorher.\n\n### Unterkapitel\n\nNachher.');
    expect(model.done).toEqual(['Aufgabe']);
  });

  it('collects done items across the sub-headings of a nested Erledigt list', () => {
    const file = parseDiaryMarkdown(fixture('nested Erledigt with sub-headings and plain bullets'));
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.done).toEqual(['Auftrag Elektriker', 'Sitzung organisieren', 'Termin verschoben']);
    expect(model.text).toBe('Text mit einem Bild davor.');
    expect(model.status).toBe('draft');
  });

  it('ignores a horizontal rule under Erledigt', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-08-16\n---\n\n## Erledigt\n\n- [x] Aufgabe\n\n---\n');
    expect(toDiaryModel(file, 'bka', 'uid1', RESOLVER).done).toEqual(['Aufgabe']);
  });

  it('keeps the body of a scanned entry as text and finds no done items', () => {
    const file = parseDiaryMarkdown(fixture("PDF footer — the archive's most common body shape"));
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.text).toContain('Ein Absatz aus dem gescannten Original.');
    expect(model.done).toEqual([]);
  });

  it('moves the origin footer into sourceDocument and out of the text', () => {
    const file = parseDiaryMarkdown(fixture("PDF footer — the archive's most common body shape"));
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.sourceDocument).toBe('20191108diaryMusterdorf.pdf');
    expect(model.text).toBe('Ein Absatz aus dem gescannten Original.');
  });

  it('leaves sourceDocument empty when there is no footer', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-08-16\n---\n\n## Persönliche Gedanken\n\nOhne Footer.\n');
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.sourceDocument).toBe('');
    expect(model.text).toBe('Ohne Footer.');
  });

  it('does not mistake a horizontal rule inside the text for a footer', () => {
    const file = parseDiaryMarkdown('---\ndate: 2026-08-16\n---\n\n## Persönliche Gedanken\n\nVorher.\n\n---\n\nNachher.\n');
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.sourceDocument).toBe('');
    expect(model.text).toBe('Vorher.\n\n---\n\nNachher.');
  });

  it('finds the footer even when it sits after the Erledigt section', () => {
    const file = parseDiaryMarkdown(
      '---\ndate: 2026-08-16\n---\n\n## Persönliche Gedanken\n\nText.\n\n## Erledigt\n\n- [x] Etwas\n\n---\n*Original: [x.pdf](x.pdf)*\n'
    );
    const model = toDiaryModel(file, 'bka', 'uid1', RESOLVER);
    expect(model.sourceDocument).toBe('x.pdf');
    expect(model.text).toBe('Text.');
    expect(model.done).toEqual(['Etwas']);
  });
});

describe('toDiaryModel — Datierungsgenauigkeit (scope)', () => {
  const withFrontmatter = (fm: string) =>
    toDiaryModel(parseDiaryMarkdown(`---\n${fm}\n---\n\n## Persönliche Gedanken\n\nText.\n`),
      't1', 'u1', RESOLVER);

  it('behandelt einen Eintrag ohne scope als Tag', () => {
    const model = withFrontmatter('date: 2026-08-16\ntitle: Tag');
    expect(model.scope).toBe('day');
    expect(model.date).toBe('20260816');
  });

  it('füllt das Monats-Aggregat auf yyyymm00 auf', () => {
    const model = withFrontmatter('date: 2004-10\nscope: month\ntitle: Herbst');
    expect(model.scope).toBe('month');
    expect(model.date).toBe('20041000');
  });

  it('füllt das Jahres-Aggregat auf yyyy0000 auf', () => {
    const model = withFrontmatter('date: 1990\nscope: year\ntitle: Paris');
    expect(model.scope).toBe('year');
    expect(model.date).toBe('19900000');
  });

  it('sortiert das Aggregat vor jeden Tag, den es enthält', () => {
    const jahr = withFrontmatter('date: 2004\nscope: year\ntitle: J');
    const monat = withFrontmatter('date: 2004-10\nscope: month\ntitle: M');
    const tag = withFrontmatter('date: 2004-10-02\ntitle: T');
    expect([tag.date, jahr.date, monat.date].sort()).toEqual([jahr.date, monat.date, tag.date]);
  });

  it('meldet den Eintrag als datumslos, wenn der scope mehr Genauigkeit behauptet als das Datum hergibt', () => {
    // Nicht raten: ein falsches Datum landet auf einer fremden Dokument-ID und ueberschreibt sie.
    expect(withFrontmatter('date: 2004\nscope: month\ntitle: X').date).toBe('');
    expect(withFrontmatter('date: 2004-10\nscope: year\ntitle: X').date).toBe('');
  });

  it('faellt bei unbekanntem scope auf Tag zurueck', () => {
    const model = withFrontmatter('date: 2026-08-16\nscope: quartal\ntitle: X');
    expect(model.scope).toBe('day');
    expect(model.date).toBe('20260816');
  });

  it('laesst ein unparsbares Tagesdatum leer, statt zu werfen', () => {
    expect(withFrontmatter('date: irgendwann\ntitle: X').date).toBe('');
  });
});
