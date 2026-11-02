import { describe, expect, it } from 'vitest';

import { courseResponsibleKeys, courseTrainerKeys } from './course-keys';

describe('courseTrainerKeys', () => {
  it('lists trainers then responsibles, deduped, empty keys dropped', () => {
    expect(
      courseTrainerKeys({ trainers: [{ key: 'pT' }, { key: '' }], responsiblePersons: [{ key: 'pR' }, { key: 'pT' }] }),
    ).toEqual(['pT', 'pR']);
  });
  it('keeps the exact case', () => {
    expect(courseTrainerKeys({ trainers: [{ key: 'AbC' }, { key: 'abc' }] })).toEqual(['AbC', 'abc']);
  });
  it('coalesces legacy docs without the arrays', () => {
    expect(courseTrainerKeys({})).toEqual([]);
    expect(courseTrainerKeys({ trainers: undefined, responsiblePersons: undefined })).toEqual([]);
  });
});

describe('courseResponsibleKeys', () => {
  it('lists only the responsible persons', () => {
    expect(courseResponsibleKeys({ trainers: [{ key: 'pT' }], responsiblePersons: [{ key: 'pR' }] })).toEqual(['pR']);
  });
  it('coalesces legacy docs', () => {
    expect(courseResponsibleKeys({})).toEqual([]);
  });
});
