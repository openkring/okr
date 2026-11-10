import { describe, expect, it } from 'vitest';

import { HttpsError } from 'firebase-functions/v2/https';

import {
  applyCourseChoice,
  checkCourseChoice,
  countCoursePlaces,
  courseFieldOf,
  courseNameNote,
  projectCourseAudience,
  readAnnouncedCourses,
  withCourseChoice,
} from './course-choice';
import { prepareSubmission } from './submission-pipeline';

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

describe('applyCourseChoice', () => {
  it('sets courseKey and courseState for a key', () => {
    expect(applyCourseChoice({ name: 'A' }, 'k')).toEqual({ name: 'A', courseKey: 'k', courseState: 'registered' });
  });
  it('sets neither for an empty key, and removes what was there', () => {
    expect(applyCourseChoice({ name: 'A', courseKey: 'x', courseState: 'accepted' }, '')).toEqual({ name: 'A' });
  });
  it('never keeps a client courseState — only the server sets it', () => {
    expect(applyCourseChoice({ courseState: 'accepted' }, 'k')['courseState']).toBe('registered');
    expect('courseState' in applyCourseChoice({ courseState: 'accepted' }, '')).toBe(false);
  });
});

describe('courseNameNote', () => {
  it('adds the course name for the task note', () => {
    expect(courseNameNote({ courseKey: 'k' }, { courseKey: { k: 'Kurs A' } })).toEqual({ courseKey: 'k', courseName: 'Kurs A' });
  });
  it('leaves the values alone without a course or a name', () => {
    expect(courseNameNote({ name: 'A' }, { courseKey: { k: 'Kurs A' } })).toEqual({ name: 'A' });
    expect(courseNameNote({ courseKey: 'k' }, {})).toEqual({ courseKey: 'k' });
  });
});

describe('checkCourseChoice (submitForm, spec 1.152 §7.3)', () => {
  const TODAY = '20261110';
  const OPEN = { tenants: ['scs'], isAnnounced: true, isArchived: false, audience: ['youth'], endDate: '20270101', startDate: '20261201', name: 'Kurs', maxParticipants: 2 };

  /** courses by id (doc reads) and applications (count query); counts doc reads in `reads`. */
  function db(courses: Record<string, Record<string, unknown>>, applications: { id: string; data: Record<string, unknown> }[] = []) {
    const reads: string[] = [];
    const fake = {
      collection: (name: string) => {
        const q = {
          where: () => q,
          get: async () => ({ docs: (name === 'applications' ? applications : []).map(d => ({ id: d.id, data: () => d.data })) }),
          doc: (id: string) => ({
            get: async () => {
              reads.push(`${name}/${id}`);
              const data = name === 'courses' ? courses[id] : undefined;
              return { exists: data !== undefined, data: () => data };
            },
          }),
        };
        return q;
      },
    } as unknown as FirebaseFirestore.Firestore;
    return { fake, reads };
  }

  function args(answer: unknown, extra: Partial<Parameters<typeof checkCourseChoice>[1]> = {}): Parameters<typeof checkCourseChoice>[1] {
    return {
      fields: [TEXT_FIELD, COURSE_FIELD],
      answers: answer === undefined ? { name: 'A' } : { name: 'A', courseKey: answer },
      derivedValues: { applicationAs: 'youth' },
      values: { name: 'A', applicationAs: 'youth', ...(answer === undefined ? {} : { courseKey: answer }) },
      tenantId: 'scs',
      today: TODAY,
      isSpam: false,
      ...extra,
    };
  }

  async function refusal(p: Promise<unknown>): Promise<HttpsError> {
    try {
      await p;
    } catch (e) {
      return e as HttpsError;
    }
    throw new Error('expected a refusal');
  }

  function expectRefused(e: HttpsError) {
    expect(e).toBeInstanceOf(HttpsError);
    expect(e.code).toBe('failed-precondition');
    expect(e.message).toBe('course-unavailable');
    expect(e.details).toEqual({ reason: 'course-unavailable' });
  }

  it('stores an announced, open course for the applicant type', async () => {
    const { fake } = db({ k: OPEN });
    expect(await checkCourseChoice(fake, args('k'))).toEqual({ name: 'A', applicationAs: 'youth', courseKey: 'k', courseState: 'registered' });
  });

  it('stores no course when nothing is ticked (A3), and reads nothing', async () => {
    for (const answer of [undefined, '', null]) {
      const { fake, reads } = db({ k: OPEN });
      const r = await checkCourseChoice(fake, args(answer));
      expect('courseKey' in r).toBe(false);
      expect('courseState' in r).toBe(false);
      expect(reads).toEqual([]);
    }
  });

  it('refuses an unknown course', async () => {
    expectRefused(await refusal(checkCourseChoice(db({}).fake, args('nope'))));
  });

  it('refuses a course that is not announced', async () => {
    expectRefused(await refusal(checkCourseChoice(db({ k: { ...OPEN, isAnnounced: false } }).fake, args('k'))));
  });

  it('refuses a course of another tenant', async () => {
    expectRefused(await refusal(checkCourseChoice(db({ k: { ...OPEN, tenants: ['other'] } }).fake, args('k'))));
  });

  it('refuses a course outside the server-derived applicant type', async () => {
    const e = await refusal(checkCourseChoice(db({ k: OPEN }).fake, args('k', { derivedValues: { applicationAs: 'adult' } })));
    expectRefused(e);
  });

  it('refuses when the applicant type is not known', async () => {
    expectRefused(await refusal(checkCourseChoice(db({ k: OPEN }).fake, args('k', { derivedValues: {} }))));
  });

  it('refuses a full course', async () => {
    const apps = [
      { id: '1', data: { courseKey: 'k', courseState: 'registered', state: 'applied' } },
      { id: '2', data: { courseKey: 'k', courseState: 'accepted', state: 'applied' } },
    ];
    expectRefused(await refusal(checkCourseChoice(db({ k: OPEN }, apps).fake, args('k'))));
  });

  it('refuses an ended or archived course', async () => {
    expectRefused(await refusal(checkCourseChoice(db({ k: { ...OPEN, endDate: '20261101' } }).fake, args('k'))));
    expectRefused(await refusal(checkCourseChoice(db({ k: { ...OPEN, isArchived: true } }).fake, args('k'))));
  });

  it('refuses a non-string course value without reading anything', async () => {
    for (const answer of [['k'], { k: true }, 42, true, [], ' ', 'a/b']) {
      const { fake, reads } = db({ k: OPEN });
      expectRefused(await refusal(checkCourseChoice(fake, args(answer))));
      expect(reads).toEqual([]);
    }
  });

  it('skips the check and stores no course for a spam-flagged submission', async () => {
    const { fake, reads } = db({});
    const r = await checkCourseChoice(fake, args('nope', { isSpam: true }));
    expect('courseKey' in r).toBe(false);
    expect('courseState' in r).toBe(false);
    expect(reads).toEqual([]);
  });

  it('drops a client courseKey/courseState when the form has no course field', async () => {
    const { fake, reads } = db({ k: OPEN });
    const r = await checkCourseChoice(fake, args('k', { fields: [TEXT_FIELD], values: { name: 'A', courseKey: 'k', courseState: 'accepted' } }));
    expect(r).toEqual({ name: 'A' });
    expect(reads).toEqual([]);
  });

  it('drops a client courseState next to a valid choice', async () => {
    const r = await checkCourseChoice(db({ k: OPEN }).fake, args('k', { values: { name: 'A', courseKey: 'k', courseState: 'accepted' } }));
    expect(r['courseState']).toBe('registered');
  });
});

describe('prepareSubmission drops course keys that are no input field (1.152)', () => {
  it('a form without a course field never stores a client courseKey or courseState', () => {
    const p = prepareSubmission([TEXT_FIELD] as never, [], 'properties', { name: 'A', courseKey: 'k', courseState: 'accepted' }, '20261110');
    expect('courseKey' in p.values).toBe(false);
    expect('courseState' in p.values).toBe(false);
  });
  it('a form with a course field drops a client courseState and exposes the derived applicant type', () => {
    const p = prepareSubmission([TEXT_FIELD, COURSE_FIELD] as never, DERIVED as never, 'properties', { name: 'A', courseKey: 'k', courseState: 'accepted' }, '20261110');
    expect('courseState' in p.values).toBe(false);
    expect(p.answers['courseKey']).toBe('k');
    expect(p.derivedValues['applicationAs']).toBe('youth');
  });
});
