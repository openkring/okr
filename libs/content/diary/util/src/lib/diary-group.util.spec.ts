import { describe, expect, it } from 'vitest';

import { DiaryModel, DiaryScope } from '@okr/shared-models';

import { groupDiariesByMonth } from './diary-group.util';

const d = (date: string, scope: DiaryScope = 'day'): DiaryModel => ({ ...new DiaryModel('t'), date, scope, okey: date });

describe('groupDiariesByMonth', () => {
  it('groups by month in input order, month aggregate first in its month', () => {
    const groups = groupDiariesByMonth([d('20261000', 'month'), d('20261011'), d('20261002'), d('20260930')]);
    expect(groups.map(g => g.key)).toEqual(['202610', '202609']);
    expect(groups[0].items.map(i => i.date)).toEqual(['20261000', '20261011', '20261002']);
  });

  it('puts a year aggregate in its own flat group', () => {
    const groups = groupDiariesByMonth([d('20260000', 'year'), d('20261011')]);
    expect(groups[0]).toMatchObject({ key: '2026', isYear: true });
    expect(groups[1]).toMatchObject({ key: '202610', isYear: false });
  });

  it('returns no groups for no entries', () => {
    expect(groupDiariesByMonth([])).toEqual([]);
  });
});
