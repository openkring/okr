import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';

import {
  addDiaryAvatar, customLocationAvatar, customPersonAvatar, diaryAvatarId, diaryAvatarName,
  mainLocation, replaceDiaryAvatar, stripLegacyDiaryFields, withDiaryLocations,
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
});
