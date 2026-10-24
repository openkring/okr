import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';

import {
  addDiaryAvatar, customLocationAvatar, customPersonAvatar, diaryAvatarId, diaryAvatarName,
  mainLocation, migrateDiaryReferences, needsDiaryLocationMigration, replaceDiaryAvatar, stripLegacyDiaryFields,
  withDiaryLocations,
} from './diary-avatar.util';

describe('diary-avatar.util', () => {
  it('two free-text persons with different names both stay', () => {
    const list = addDiaryAvatar(addDiaryAvatar([], customPersonAvatar('Anna Muster')), customPersonAvatar('Beat Beispiel'));
    expect(list.map(diaryAvatarName)).toEqual(['Anna Muster', 'Beat Beispiel']);
  });
  it('the same place in two spellings is one entry', () => {
    const list = addDiaryAvatar([customLocationAvatar('Zürich ZH')], customLocationAvatar('zuerich'));
    expect(list).toHaveLength(1);
  });
  it('a keyed avatar is identified by its key', () => {
    expect(diaryAvatarId({ ...customLocationAvatar('X'), key: 'l1' })).toBe('key:l1');
  });
  it('replaceDiaryAvatar keeps the position', () => {
    const list = [customLocationAvatar('A'), customLocationAvatar('B')];
    const linked = { ...customLocationAvatar('Bern'), key: 'l9' };
    expect(replaceDiaryAvatar(list, diaryAvatarId(list[1]), linked).map(a => a.key)).toEqual(['', 'l9']);
  });
  it('replaceDiaryAvatar drops the entry when the target is already in the list', () => {
    const bern = { ...customLocationAvatar('Bern'), key: 'l9' };
    const list = [bern, customLocationAvatar('bern-free')];
    expect(replaceDiaryAvatar(list, diaryAvatarId(list[1]), bern)).toEqual([bern]);
  });
  it('withDiaryLocations derives locations and people from a legacy doc', () => {
    const raw = { location: { ...customLocationAvatar('Bern'), key: 'l1' }, customLocationLabel: '', places: ['uetliberg', 'bern'],
      people: [], customPeopleLabels: ['Anna Muster'] } as unknown as DiaryModel;
    const d = withDiaryLocations(raw);
    // a keyed entry and free text with the same name have different ids — both stay; resolving is Task 8's job
    expect(d.locations.map(diaryAvatarName)).toEqual(['Bern', 'uetliberg', 'bern']);
    expect(d.people.map(diaryAvatarName)).toEqual(['Anna Muster']);
  });
  it('withDiaryLocations leaves a migrated doc alone', () => {
    const raw = { locations: [customLocationAvatar('A')], location: { key: 'l1' }, people: undefined } as unknown as DiaryModel;
    expect(withDiaryLocations(raw).locations.map(diaryAvatarName)).toEqual(['A']);
    expect(withDiaryLocations(raw).people).toEqual([]);
  });
  it('customPersonAvatar splits like selectPersonAvatar', () => {
    expect(customPersonAvatar('Anna Maria Muster')).toMatchObject({ key: '', name1: 'Anna Maria', name2: 'Muster', label: '', modelType: 'person' });
  });
  it('stripLegacyDiaryFields removes exactly the four legacy keys', () => {
    expect(Object.keys(stripLegacyDiaryFields({ a: 1, location: 1, customLocationLabel: 1, places: 1, customPeopleLabels: 1 }))).toEqual(['a']);
  });
  it('customLocationAvatar has the binding shape', () => {
    expect(customLocationAvatar('Bern')).toEqual({ key: '', modelType: 'location', name1: 'Bern', name2: '', label: 'Bern', type: '', subType: '' });
  });
  it('mainLocation is the first entry, undefined when empty', () => {
    const a = customLocationAvatar('A');
    expect(mainLocation({ locations: [a, customLocationAvatar('B')] })).toBe(a);
    expect(mainLocation({ locations: [] })).toBeUndefined();
  });
  it('withDiaryLocations on a legacy doc without any location gives []', () => {
    const raw = { customLocationLabel: '', places: [], people: [], customPeopleLabels: [] } as unknown as DiaryModel;
    expect(withDiaryLocations(raw).locations).toEqual([]);
  });
  it('replaceDiaryAvatar keeps the replaced position when the target exists later', () => {
    const x = customLocationAvatar('X');
    const a = customLocationAvatar('A');
    const b = { ...customLocationAvatar('B'), key: 'l2' };
    const linked = { ...b, label: 'B linked' };
    const result = replaceDiaryAvatar([x, a, b], diaryAvatarId(x), linked);
    expect(result).toEqual([linked, a]);
    expect(result[0]).toBe(linked);
  });

  describe('needsDiaryLocationMigration', () => {
    it('is false when locations is already there, even with legacy fields', () => {
      expect(needsDiaryLocationMigration({ locations: [], places: ['x'] })).toBe(false);
    });
    it('is true when locations is absent and a legacy field is present', () => {
      expect(needsDiaryLocationMigration({ places: ['x'] })).toBe(true);
      expect(needsDiaryLocationMigration({ customLocationLabel: '' })).toBe(true);
    });
    it('is false when neither locations nor any legacy field is present', () => {
      expect(needsDiaryLocationMigration({ title: 't', people: [] })).toBe(false);
    });
  });

  describe('migrateDiaryReferences', () => {
    const bern = { key: 'l1', name1: 'Bern', name2: '', label: 'Bern', modelType: 'location' as const, type: '', subType: '' };
    const zuerich = { key: 'l2', name1: 'Zürich', name2: '', label: 'Zürich', modelType: 'location' as const, type: '', subType: '' };

    it('a resolved place dedupes against the keyed main location', () => {
      const result = migrateDiaryReferences({ location: bern, places: ['bern'] }, l => (l === 'bern' ? bern : undefined));
      expect(result.locations.map(a => a.key)).toEqual(['l1']);
    });
    it('keeps the order: main location first, then the places; unresolved stay free text unchanged', () => {
      const result = migrateDiaryReferences(
        { customLocationLabel: 'Uetliberg', places: ['zuerich', 'irgendwo-am-see'] },
        l => (l === 'zuerich' ? zuerich : undefined));
      expect(result.locations.map(diaryAvatarName)).toEqual(['Uetliberg', 'Zürich', 'irgendwo-am-see']);
      expect(result.locations.map(a => a.key)).toEqual(['', 'l2', '']);
    });
    it('resolves a free-text main location too', () => {
      const result = migrateDiaryReferences({ customLocationLabel: 'Bern BE' }, l => (l === 'Bern BE' ? bern : undefined));
      expect(result.locations).toEqual([bern]);
    });
    it('the keyed location wins over customLocationLabel', () => {
      const result = migrateDiaryReferences({ location: bern, customLocationLabel: 'Anderswo' }, () => undefined);
      expect(result.locations).toEqual([bern]);
    });
    it('two places resolving to the same record give one entry', () => {
      const result = migrateDiaryReferences({ places: ['zuerich', 'zurich-zh'] }, () => zuerich);
      expect(result.locations).toEqual([zuerich]);
    });
    it('skips blank labels', () => {
      const result = migrateDiaryReferences({ customLocationLabel: '  ', places: ['', ' '], customPeopleLabels: ['', '  '] }, () => undefined);
      expect(result).toEqual({ locations: [], people: [] });
    });
    it('appends free-text persons after the keyed ones, without duplicates', () => {
      const anna = { key: 'p1', name1: 'Anna', name2: 'Muster', label: 'Anna Muster', modelType: 'person' as const, type: '', subType: '' };
      const result = migrateDiaryReferences({ people: [anna], customPeopleLabels: ['Beat Beispiel', 'beat beispiel', 'Clara'] }, () => undefined);
      expect(result.people.map(diaryAvatarName)).toEqual(['Anna Muster', 'Beat Beispiel', 'Clara']);
      expect(result.people.map(a => a.key)).toEqual(['p1', '', '']);
    });
    it('withDiaryLocations is the same mapping without resolving', () => {
      const raw = { location: bern, places: ['bern', 'uetliberg'], people: [], customPeopleLabels: ['Anna Muster'] };
      const d = withDiaryLocations(raw as unknown as DiaryModel);
      expect({ locations: d.locations, people: d.people }).toEqual(migrateDiaryReferences(raw, () => undefined));
    });
  });
});
