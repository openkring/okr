import { describe, expect, it } from 'vitest';

import { AvatarInfo, CourseModel } from '@okr/shared-models';

import { getCourseIndex, getCourseIndexInfo } from './course.util';

function trainer(name1: string, name2: string): AvatarInfo {
  return { key: name1 + name2, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

describe('getCourseIndex', () => {
  it('lists group, period, name and trainers by family name', () => {
    const c = new CourseModel('scs');
    c.groupKey = 'g1';
    c.startDate = '20260901';
    c.endDate = '20261215';
    c.name = 'Herbstkurs';
    c.trainers = [trainer('Anna', 'Muster'), trainer('Beat', 'Meier')];
    expect(getCourseIndex(c)).toBe('g:g1 d:20260901-20261215 n:Herbstkurs t:Muster,Meier');
  });

  it('survives a legacy document without trainers', () => {
    const c = new CourseModel('scs');
    (c as { trainers?: AvatarInfo[] }).trainers = undefined;
    expect(getCourseIndex(c)).toContain('t:');
  });

  it('describes its parts', () => {
    expect(getCourseIndexInfo()).toContain('n:ame');
  });
});
