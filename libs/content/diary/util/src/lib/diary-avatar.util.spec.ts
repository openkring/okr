import { describe, expect, it } from 'vitest';
import { DiaryModel, LocationModel } from '@okr/shared-models';

import {
  addDiaryAvatar, customLocationAvatar, customPersonAvatar, diaryAvatarId, diaryAvatarName,
  linkLocationInDiary, mainLocation, replaceDiaryAvatar, withDiaryLocations,
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
  it('withDiaryLocations keeps the lists of a document', () => {
    const raw = { locations: [customLocationAvatar('A')], people: [customPersonAvatar('Anna Muster')] } as unknown as DiaryModel;
    expect(withDiaryLocations(raw).locations.map(diaryAvatarName)).toEqual(['A']);
    expect(withDiaryLocations(raw).people.map(diaryAvatarName)).toEqual(['Anna Muster']);
  });
  it('withDiaryLocations fills missing lists with []', () => {
    const raw = { locations: undefined, people: undefined } as unknown as DiaryModel;
    expect(withDiaryLocations(raw).locations).toEqual([]);
    expect(withDiaryLocations(raw).people).toEqual([]);
  });
  it('customPersonAvatar splits like selectPersonAvatar', () => {
    expect(customPersonAvatar('Anna Maria Muster')).toMatchObject({ key: '', name1: 'Anna Maria', name2: 'Muster', label: '', modelType: 'person' });
  });
  it('customLocationAvatar has the binding shape', () => {
    expect(customLocationAvatar('Bern')).toEqual({ key: '', modelType: 'location', name1: 'Bern', name2: '', label: 'Bern', type: '', subType: '' });
  });
  it('mainLocation is the first entry, undefined when empty', () => {
    const a = customLocationAvatar('A');
    expect(mainLocation({ locations: [a, customLocationAvatar('B')] })).toBe(a);
    expect(mainLocation({ locations: [] })).toBeUndefined();
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
});

describe('linkLocationInDiary', () => {
  const place = (okey: string, name: string): LocationModel => {
    const l = new LocationModel('scs');
    l.okey = okey;
    l.name = name;
    return l;
  };
  const diaryWith = (locations?: DiaryModel['locations']): DiaryModel => {
    const d = new DiaryModel('scs');
    d.okey = 'd1';
    if (locations === undefined) delete (d as Partial<DiaryModel>).locations;
    else d.locations = locations;
    return d;
  };

  it('replaces the entry in place, keeping the main location first', () => {
    const a = customLocationAvatar('Hafen');
    const b = customLocationAvatar('Bern');
    const c = customLocationAvatar('Thun');
    const result = linkLocationInDiary(diaryWith([a, b, c]), diaryAvatarId(b), place('l9', 'Bern Stadt'));
    expect(result.locations?.map(x => x.key)).toEqual(['', 'l9', '']);
    expect(result.locations?.[0]).toBe(a);
  });
  it('comes back equal when the id is absent', () => {
    const d = diaryWith([customLocationAvatar('Hafen')]);
    expect(linkLocationInDiary(d, 'label:nope', place('l9', 'X'))).toEqual(d);
  });
  it('normalises a doc without locations first', () => {
    const result = linkLocationInDiary(diaryWith(undefined), 'label:nope', place('l9', 'X'));
    expect(result.locations).toEqual([]);
    expect(result.people).toEqual([]);
  });
});
