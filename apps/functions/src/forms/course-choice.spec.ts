import { describe, expect, it } from 'vitest';

import { countCoursePlaces, courseFieldOf, projectCourseAudience, readAnnouncedCourses, withCourseChoice } from './course-choice';

const COURSE_FIELD = { id: 'c', key: 'courseKey', type: 'course', label: 'Kurs', required: false, width: 'full', order: 2, audienceFrom: 'applicationAs' };
const TEXT_FIELD = { id: 'a', key: 'name', type: 'text', label: 'Name', required: true, width: 'full', order: 0 };
const DERIVED = [
  { key: 'other', cases: [], otherwise: 'x' },
  { key: 'applicationAs', cases: [{ when: { mode: 'all', conditions: [] }, value: 'youth' }], otherwise: 'adult' },
];

/** Minimal Firestore stand-in: collection(name).where(...).get() returns the canned docs. */
function fakeDb(byCollection: Record<string, { id: string; data: Record<string, unknown> }[]>, fail = false) {
  return {
    collection: (name: string) => {
      const q = {
        where: () => q,
        get: async () => {
          if (fail) throw new Error('boom');
          return { docs: (byCollection[name] ?? []).map(d => ({ id: d.id, data: () => d.data })) };
        },
      };
      return q;
    },
  } as unknown as FirebaseFirestore.Firestore;
}

describe('courseFieldOf', () => {
  it('finds the course field', () => expect(courseFieldOf([TEXT_FIELD, COURSE_FIELD])?.audienceFrom).toBe('applicationAs'));
  it('is undefined without one', () => {
    expect(courseFieldOf([TEXT_FIELD])).toBeUndefined();
    expect(courseFieldOf(undefined)).toBeUndefined();
  });
});

describe('projectCourseAudience', () => {
  it('returns only the matching entry', () => expect(projectCourseAudience(DERIVED, 'applicationAs')?.key).toBe('applicationAs'));
  it('is undefined when missing', () => {
    expect(projectCourseAudience(DERIVED, 'nope')).toBeUndefined();
    expect(projectCourseAudience(undefined, 'applicationAs')).toBeUndefined();
  });
});

describe('withCourseChoice', () => {
  const projected = { name: 'F' };
  const courses = [{ key: 'k', name: 'n', startDate: '1', endDate: '2', audience: ['youth'], remaining: -1, isFull: false }] as never;
  it('adds both for a form with a course field', () => {
    const r = withCourseChoice(projected, [COURSE_FIELD], DERIVED, courses);
    expect(r['courseAudience']).toMatchObject({ key: 'applicationAs' });
    expect(r['courses']).toBe(courses);
  });
  it('adds neither without a course field', () => {
    const r = withCourseChoice(projected, [TEXT_FIELD], DERIVED, courses);
    expect('courseAudience' in r).toBe(false);
    expect('courses' in r).toBe(false);
  });
});

describe('countCoursePlaces', () => {
  it('counts only place-holding applications', async () => {
    const db = fakeDb({ applications: [
      { id: '1', data: { courseKey: 'k', courseState: 'registered', state: 'open' } },
      { id: '2', data: { courseKey: 'k', courseState: 'accepted', state: 'closed.cancelled' } },
      { id: '3', data: { courseKey: 'k', courseState: 'declined', state: 'open' } },
      { id: '4', data: { courseKey: 'k', courseState: 'invited', state: 'open' } },
    ] });
    expect(await countCoursePlaces(db, 'scs', 'k')).toBe(2);
  });
});

describe('readAnnouncedCourses', () => {
  const open = { tenants: ['scs'], isAnnounced: true, isArchived: false, audience: ['youth'], endDate: '20270101', startDate: '20261201', name: 'Kurs', maxParticipants: 2 };
  it('keeps open courses with remaining places, sorted by start', async () => {
    const db = fakeDb({
      courses: [
        { id: 'late', data: { ...open, startDate: '20270101' } },
        { id: 'ended', data: { ...open, endDate: '20260101' } },
        { id: 'early', data: open },
      ],
      applications: [{ id: 'a', data: { courseKey: 'early', courseState: 'registered', state: 'open' } }],
    });
    const r = await readAnnouncedCourses(db, 'scs', '20261110');
    expect(r.map(c => c.key)).toEqual(['early', 'late']);
    expect(r[0].remaining).toBe(1);
  });
  it('returns [] when reading fails', async () => {
    expect(await readAnnouncedCourses(fakeDb({}, true), 'scs', '20261110')).toEqual([]);
  });
});
