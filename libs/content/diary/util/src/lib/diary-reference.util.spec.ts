import { describe, expect, it } from 'vitest';

import { AvatarInfo, DiaryModel } from '@okr/shared-models';

import { customLocationAvatar, customPersonAvatar } from './diary-avatar.util';
import {
  collectLocationReferences, collectPersonReferences, filterDiaryReferences, formatDiaryDate,
  formatDiaryDateLong, formatDiaryDateShort, formatDiaryMonthHeader,
} from './diary-reference.util';

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
