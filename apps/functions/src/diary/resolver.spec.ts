// apps/functions/src/diary/resolver.spec.ts
import { describe, expect, it } from 'vitest';
import { buildResolver } from './resolver';

const PERSONS = new Map([['p1', { firstName: 'Ada', lastName: 'Muster' }]]);
const ALIASES = new Map([['bka__person__ada', 'person.p1']]);
const TRIPS = new Map([['20200100beispiel', 'bka__travel__20200100beispiel']]);

describe('buildResolver', () => {
  const r = buildResolver('bka', ALIASES, PERSONS, TRIPS);

  it('resolves a known person slug to an AvatarInfo', () => {
    expect(r.resolvePerson('ada')).toEqual({
      key: 'p1', name1: 'Ada', name2: 'Muster',
      modelType: 'person', type: '', subType: '', label: 'Ada Muster',
    });
  });

  it('normalises the slug the same way the seeding did', () => {
    // 'Ada' and 'ada' must hit the same alias — the space is caseSensitive: false.
    expect(r.resolvePerson('Ada')?.key).toBe('p1');
  });

  it('returns undefined for an unknown person, so the label stays free text', () => {
    expect(r.resolvePerson('unbekannt')).toBeUndefined();
  });

  it('returns undefined for every location — bka has no location records', () => {
    expect(r.resolveLocation('irgendwo')).toBeUndefined();
  });

  it('resolves a trip slug to its document id, and an unknown one to an empty string', () => {
    expect(r.resolveTrip('20200100beispiel')).toBe('bka__travel__20200100beispiel');
    expect(r.resolveTrip('20200100fehlt')).toBe('');
  });
});
