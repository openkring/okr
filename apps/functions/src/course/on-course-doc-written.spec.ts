import { describe, expect, it, vi } from 'vitest';

import { handleCourseKeys, type CourseWrittenEvent } from './on-course-doc-written';

function eventOf(data: Record<string, unknown> | undefined) {
  const update = vi.fn().mockResolvedValue(undefined);
  const event = {
    params: { courseId: 'c1' },
    data: { after: { exists: data !== undefined, data: () => data, ref: { update } } },
  } as unknown as CourseWrittenEvent;
  return { event, update };
}

describe('handleCourseKeys', () => {
  it('writes both mirrors when they are missing (legacy doc)', async () => {
    const { event, update } = eventOf({ trainers: [{ key: 'pT' }], responsiblePersons: [{ key: 'pR' }] });
    await handleCourseKeys(event);
    expect(update).toHaveBeenCalledWith({ trainerKeys: ['pT', 'pR'], responsibleKeys: ['pR'] });
  });

  it('does not write when the mirrors are current (no trigger loop)', async () => {
    const { event, update } = eventOf({
      trainers: [{ key: 'pT' }],
      responsiblePersons: [{ key: 'pR' }],
      trainerKeys: ['pT', 'pR'],
      responsibleKeys: ['pR'],
    });
    await handleCourseKeys(event);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes when only responsibleKeys is stale', async () => {
    const { event, update } = eventOf({
      trainers: [],
      responsiblePersons: [{ key: 'pR' }],
      trainerKeys: ['pR'],
      responsibleKeys: [],
    });
    await handleCourseKeys(event);
    expect(update).toHaveBeenCalledWith({ trainerKeys: ['pR'], responsibleKeys: ['pR'] });
  });

  it('clears the mirrors when the persons were removed', async () => {
    const { event, update } = eventOf({ trainers: [], responsiblePersons: [], trainerKeys: ['x'], responsibleKeys: ['x'] });
    await handleCourseKeys(event);
    expect(update).toHaveBeenCalledWith({ trainerKeys: [], responsibleKeys: [] });
  });

  it('skips a deleted course', async () => {
    const { event, update } = eventOf(undefined);
    await handleCourseKeys(event);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing for a doc with no persons and no mirrors', async () => {
    const { event, update } = eventOf({});
    await handleCourseKeys(event);
    expect(update).not.toHaveBeenCalled();
  });
});
