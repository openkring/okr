import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';
import { getDiaryIndex } from './diary-index.util';

describe('getDiaryIndex', () => {
  it('indexes date, title, place, people (resolved and not), events and places', () => {
    const d: DiaryModel = {
      ...new DiaryModel('t1'),
      date: '20220306', title: 'Sample Title',
      location: { key: 'l1', name1: 'Stäfa', name2: '', label: 'Stäfa ZH', modelType: 'location', type: '', subType: '' },
      people: [{ key: 'p1', name1: 'Ada', name2: 'Lovelace', label: 'Ada Lovelace', modelType: 'person', type: '', subType: '' }],
      customPeopleLabels: ['someSlug'],
      events: ['ostern'], places: ['sedrun'],
    };
    const index = getDiaryIndex(d);
    for (const token of ['20220306', 'Sample Title', 'Stäfa ZH', 'Ada Lovelace', 'someSlug', 'ostern', 'sedrun']) {
      expect(index).toContain(token);
    }
  });
  it('falls back to the custom location label', () => {
    expect(getDiaryIndex({ ...new DiaryModel('t1'), customLocationLabel: 'Somewhere' })).toContain('Somewhere');
  });
});
