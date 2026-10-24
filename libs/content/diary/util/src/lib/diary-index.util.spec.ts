import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';
import { customLocationAvatar, customPersonAvatar } from './diary-avatar.util';
import { getDiaryIndex } from './diary-index.util';

describe('getDiaryIndex', () => {
  it('indexes date, title, locations, people (linked and free text) and events', () => {
    const d: DiaryModel = {
      ...new DiaryModel('t1'),
      date: '20220306', title: 'Sample Title',
      locations: [
        { key: 'l1', name1: 'Stäfa', name2: '', label: 'Stäfa ZH', modelType: 'location', type: '', subType: '' },
        customLocationAvatar('Uetliberg'),
      ],
      people: [
        { key: 'p1', name1: 'Ada', name2: 'Lovelace', label: 'Ada Lovelace', modelType: 'person', type: '', subType: '' },
        customPersonAvatar('Anna Muster'),
      ],
      events: ['ostern'],
    };
    const index = getDiaryIndex(d);
    for (const token of ['20220306', 'Sample Title', 'Stäfa ZH', 'Uetliberg', 'Ada Lovelace', 'Anna Muster', 'ostern']) {
      expect(index).toContain(token);
    }
    expect(index).not.toContain('pl:');
  });
  it('indexes a free-text location', () => {
    expect(getDiaryIndex({ ...new DiaryModel('t1'), locations: [customLocationAvatar('Somewhere')] })).toContain('Somewhere');
  });
});
