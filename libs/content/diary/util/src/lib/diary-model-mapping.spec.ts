import { AvatarInfo } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { DiaryResolver, toDiaryModel } from './diary-model-mapping';
import { parseDiaryMarkdown } from './diary-parse';

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
});
