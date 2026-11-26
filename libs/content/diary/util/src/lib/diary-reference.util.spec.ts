import { describe, expect, it } from 'vitest';

import { AvatarInfo, DiaryModel, LocationModel } from '@okr/shared-models';

import { customLocationAvatar, customPersonAvatar, diaryAvatarId } from './diary-avatar.util';
import {
  collectLocationReferences, collectPersonReferences, diariesWithLocationReference, filterDiaryReferences, formatDiaryDate,
  formatDiaryDateLong, formatDiaryDateShort, formatDiaryMonthHeader, inChunks, linkLocationInDiary, locationLinkTargets,
} from './diary-reference.util';
import { getDiaryIndex } from './diary-index.util';

const TENANT = 'scs';

function diary(date: string, overrides: Partial<DiaryModel> = {}): DiaryModel {
  const model = new DiaryModel(TENANT);
  model.okey = `d${date}`;
  model.date = date;
  model.title = `Tag ${date}`;
  return Object.assign(model, overrides);
}

function locationAvatar(key: string, name: string): AvatarInfo {
  return { key, name1: name, name2: '', modelType: 'location', type: '', subType: '', label: name };
}

function personAvatar(key: string, first: string, last: string): AvatarInfo {
  return { key, name1: first, name2: last, modelType: 'person', type: '', subType: '', label: `${first} ${last}` };
}

describe('collectLocationReferences', () => {
  it('returns nothing for diaries without any place', () => {
    expect(collectLocationReferences([diary('20220306')])).toEqual([]);
  });

  it('aggregates a resolved location over every diary that uses it', () => {
    const location = locationAvatar('loc1', 'Stäfa');
    const references = collectLocationReferences([
      diary('20220306', { locations: [location] }),
      diary('20220307', { locations: [location] }),
    ]);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ kind: 'location', id: 'key:loc1', label: 'Stäfa', key: 'loc1', resolved: true });
    expect(references[0].usages.map(u => u.okey)).toEqual(['d20220307', 'd20220306']);
  });

  it('aggregates unresolved labels by their normalised form, not verbatim', () => {
    const references = collectLocationReferences([
      diary('20220306', { locations: [customLocationAvatar('Zürich ZH')] }),
      diary('20220307', { locations: [customLocationAvatar('Zuerich')] }),
    ]);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ id: 'label:zuerich', key: '', resolved: false });
    expect(references[0].usages).toHaveLength(2);
  });

  it('resolves a keyed location in second position', () => {
    const references = collectLocationReferences([
      diary('20220306', { locations: [customLocationAvatar('Stansstad'), locationAvatar('loc1', 'Stäfa')] }),
    ]);

    expect(references.map(r => [r.label, r.resolved])).toEqual([['Stansstad', false], ['Stäfa', true]]);
  });

  it('ignores blank free-text locations', () => {
    const references = collectLocationReferences([
      diary('20220306', { locations: [customLocationAvatar('   ')] }),
    ]);

    expect(references).toEqual([]);
  });

  it('sorts unresolved first, then alphabetically', () => {
    const references = collectLocationReferences([
      diary('20220306', { locations: [locationAvatar('loc1', 'Aarau')] }),
      diary('20220307', { locations: [customLocationAvatar('Zermatt')] }),
      diary('20220308', { locations: [customLocationAvatar('Basel')] }),
    ]);

    expect(references.map(r => r.label)).toEqual(['Basel', 'Zermatt', 'Aarau']);
  });
});

describe('collectPersonReferences', () => {
  it('aggregates resolved people and custom labels side by side', () => {
    const references = collectPersonReferences([
      diary('20220306', { people: [personAvatar('p1', 'Anna', 'Meier'), customPersonAvatar('fritz')] }),
      diary('20220307', { people: [personAvatar('p1', 'Anna', 'Meier')] }),
    ]);

    expect(references.map(r => [r.label, r.resolved, r.usages.length]))
      .toEqual([['fritz', false, 1], ['Anna Meier', true, 2]]);
  });

  it('makes one row per free-text person', () => {
    const references = collectPersonReferences([
      diary('20220306', { people: [customPersonAvatar('Anna Muster'), customPersonAvatar('Beat Beispiel')] }),
    ]);

    expect(references.map(r => r.label)).toEqual(['Anna Muster', 'Beat Beispiel']);
    expect(references.every(r => !r.resolved)).toBe(true);
  });

  it('skips blank free-text people', () => {
    const references = collectPersonReferences([
      diary('20220306', { people: [customPersonAvatar('  ')] }),
    ]);

    expect(references).toEqual([]);
  });

  it('folds the same custom label under one row regardless of case', () => {
    const references = collectPersonReferences([
      diary('20220306', { people: [customPersonAvatar('Fritz')] }),
      diary('20220307', { people: [customPersonAvatar('fritz')] }),
    ]);

    expect(references).toHaveLength(1);
    expect(references[0].usages).toHaveLength(2);
  });
});

describe('filterDiaryReferences', () => {
  const references = collectLocationReferences([
    diary('20220306', { locations: [locationAvatar('loc1', 'Stäfa')] }),
    diary('20220307', { locations: [customLocationAvatar('Stansstad')] }),
  ]);

  it('passes everything through without a term on the all filter', () => {
    expect(filterDiaryReferences(references, '', 'all')).toHaveLength(2);
  });

  it('keeps only the requested half', () => {
    expect(filterDiaryReferences(references, '', 'resolved').map(r => r.label)).toEqual(['Stäfa']);
    expect(filterDiaryReferences(references, '', 'unresolved').map(r => r.label)).toEqual(['Stansstad']);
  });

  it('matches the search term case-insensitively on the label', () => {
    expect(filterDiaryReferences(references, 'stans', 'all').map(r => r.label)).toEqual(['Stansstad']);
  });

  it('combines both filters', () => {
    expect(filterDiaryReferences(references, 'st', 'resolved').map(r => r.label)).toEqual(['Stäfa']);
  });
});

describe('formatDiaryDate', () => {
  it('renders a full day', () => {
    expect(formatDiaryDate('20220306')).toBe('06.03.2022');
  });

  it('drops the zeroed day of a month aggregate', () => {
    expect(formatDiaryDate('20041000')).toBe('10.2004');
  });

  it('drops month and day of a year aggregate', () => {
    expect(formatDiaryDate('19900000')).toBe('1990');
  });

  it('passes anything that is not eight digits through unchanged', () => {
    expect(formatDiaryDate('')).toBe('');
    expect(formatDiaryDate('2022-03-06')).toBe('2022-03-06');
  });
});

describe('formatDiaryDateShort', () => {
  it('prefixes the short weekday, upper-cased', () => expect(formatDiaryDateShort('20261011', 'de')).toBe('SO 11.10.2026'));
  it('uses the given language', () => expect(formatDiaryDateShort('20261011', 'en')).toBe('SUN 11.10.2026'));
  it('leaves a month aggregate alone', () => expect(formatDiaryDateShort('20261000', 'de')).toBe('10.2026'));
  it('leaves a year aggregate alone', () => expect(formatDiaryDateShort('20260000', 'de')).toBe('2026'));
  it('passes garbage through', () => expect(formatDiaryDateShort('abc', 'de')).toBe('abc'));
});

describe('formatDiaryDateLong', () => {
  it('spells the weekday out', () => expect(formatDiaryDateLong('20261011', 'de')).toBe('Sonntag, 11.10.2026'));
  it('leaves an aggregate alone', () => expect(formatDiaryDateLong('20261000', 'de')).toBe('10.2026'));
});

describe('formatDiaryMonthHeader', () => {
  it('names the month', () => expect(formatDiaryMonthHeader('202610', 'de')).toBe('Oktober 2026'));
});

describe('diariesWithLocationReference', () => {
  it('returns only diaries holding the free-text entry, never keyed ones with the same label', () => {
    const free = customLocationAvatar('Hafen');
    const id = diaryAvatarId(free);
    const d1 = diary('20260101', { locations: [free] });
    const d2 = diary('20260102', { locations: [locationAvatar('l1', 'Ort'), customLocationAvatar('hafen')] });
    const d3 = diary('20260103', { locations: [locationAvatar('l2', 'Hafen')] });
    expect(diariesWithLocationReference([d1, d2, d3], id).map(d => d.okey)).toEqual([d1.okey, d2.okey]);
  });
  it('does not match a keyed id', () => {
    const d = diary('20260101', { locations: [locationAvatar('l2', 'Hafen')] });
    expect(diariesWithLocationReference([d], 'key:l2')).toEqual([]);
  });
  it('copes with a doc lacking locations', () => {
    const d = diary('20260101');
    delete (d as Partial<DiaryModel>).locations;
    expect(diariesWithLocationReference([d], 'label:hafen')).toEqual([]);
  });
});

describe('locationLinkTargets', () => {
  const free = customLocationAvatar('Hafen');
  const id = diaryAvatarId(free);
  it('puts the current day first, as listed, followed by the other matching days', () => {
    const d1 = diary('20260101', { locations: [free] });
    const d2 = diary('20260102', { locations: [free] });
    const d3 = diary('20260103', { locations: [customLocationAvatar('Anderswo')] });
    const shown = { ...d2, title: 'stale copy' };
    const targets = locationLinkTargets([d1, d2, d3], shown, id);
    expect(targets.map(d => d.okey)).toEqual([d2.okey, d1.okey]);
    expect(targets[0]).toBe(d2);
  });
  it('still links the current day when the list lacks it', () => {
    const d1 = diary('20260101', { locations: [free] });
    const shown = diary('20260105', { locations: [free] });
    expect(locationLinkTargets([d1], shown, id).map(d => d.okey)).toEqual([shown.okey, d1.okey]);
  });
  it('returns only the current day when nothing else matches', () => {
    const shown = diary('20260105', { locations: [free] });
    expect(locationLinkTargets([], shown, id)).toEqual([shown]);
  });
});

describe('inChunks', () => {
  it('slices into batches of at most size', () => {
    expect(inChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns no batch for an empty list', () => {
    expect(inChunks([], 200)).toEqual([]);
  });
  it('treats a size below 1 as 1', () => {
    expect(inChunks(['a', 'b'], 0)).toEqual([['a'], ['b']]);
  });
  it('keeps 401 items in three batches of 200', () => {
    expect(inChunks(Array.from({ length: 401 }, (_, i) => i), 200).map(c => c.length)).toEqual([200, 200, 1]);
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
  it('keeps the locations when the id is absent', () => {
    const d = diaryWith([customLocationAvatar('Hafen')]);
    expect(linkLocationInDiary(d, 'label:nope', place('l9', 'X')).locations).toEqual(d.locations);
  });
  it('rebuilds the search index: the location name in, the replaced free text out', () => {
    const d = diaryWith([customLocationAvatar('Hafen'), customLocationAvatar('Pfaeffikon SZ')]);
    d.index = getDiaryIndex(d);
    const result = linkLocationInDiary(d, diaryAvatarId(d.locations[1]), place('l9', 'Seedamm'));
    expect(result.index).toContain('Seedamm');
    expect(result.index).not.toContain('Pfaeffikon');
    expect(result.index).toContain('Hafen');
  });
  it('keeps free text in the index that still occurs elsewhere (the title)', () => {
    const d = diaryWith([customLocationAvatar('Pfaeffikon SZ')]);
    d.title = 'Pfaeffikon';
    const result = linkLocationInDiary(d, diaryAvatarId(d.locations[0]), place('l9', 'Seedamm'));
    expect(result.index).toContain('Seedamm');
    expect(result.index).toContain('Pfaeffikon');
  });
  it('normalises a doc without locations first', () => {
    const result = linkLocationInDiary(diaryWith(undefined), 'label:nope', place('l9', 'X'));
    expect(result.locations).toEqual([]);
    expect(result.people).toEqual([]);
  });
});
