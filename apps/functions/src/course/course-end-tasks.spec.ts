import { describe, expect, it, vi } from 'vitest';

import type { AvatarInfo, CourseModel } from '@okr/shared-models';

import { buildCourseEndTask, coursesNeedingEndTask, createCourseEndTasks, type CourseDoc } from './course-end-tasks';

const person = (key: string): AvatarInfo => ({ key, name1: `F${key}`, name2: `L${key}`, modelType: 'person', type: '', subType: '', label: `F${key} L${key}` });
const pR = person('pR');
const pA = person('pA');

function c(over: Partial<CourseModel> & { okey?: string } = {}): CourseDoc {
  return {
    okey: 'k1', tenants: ['scs'], isArchived: false, name: 'U14', groupKey: 'g1', endDate: '20261031',
    responsiblePersons: [pR], endTaskKey: '', ...over,
  } as CourseDoc;
}

describe('coursesNeedingEndTask', () => {
  it('keeps only ended, unarchived courses without an end task', () => {
    const result = coursesNeedingEndTask([
      c({ okey: 'ended' }),
      c({ okey: 'today', endDate: '20261101' }),
      c({ okey: 'future', endDate: '20261201' }),
      c({ okey: 'done', endTaskKey: 'course-done-end' }),
      c({ okey: 'archived', isArchived: true }),
      c({ okey: 'undated', endDate: '' }),
    ], '20261101');
    expect(result.map((x) => x.okey)).toEqual(['ended']);
  });

  it('keeps a course without responsible person (the runner falls back to a group admin)', () => {
    expect(coursesNeedingEndTask([c({ responsiblePersons: [] }), c({ responsiblePersons: undefined })], '20261101').length).toBe(2);
  });

  it('treats a legacy doc without endTaskKey as not yet created', () => {
    const legacy = c();
    delete (legacy as Partial<CourseDoc>).endTaskKey;
    expect(coursesNeedingEndTask([legacy], '20261101').length).toBe(1);
  });
});

describe('buildCourseEndTask', () => {
  it('builds the deterministic task assigned to the first responsible person', () => {
    const t = buildCourseEndTask(c({ okey: 'k1', name: 'U14', responsiblePersons: [pR, pA] }), 'https://app.example', '20261101');
    expect(t.okey).toBe('course-k1-end');
    expect(t.doc['name']).toBe('Kurs abschliessen: U14');
    expect(t.doc['linkModelType']).toBe('course');
    expect(t.doc['linkKey']).toBe('course.k1');
    expect(t.doc['dueDate']).toBe('20261115');
    expect(t.doc['tenants']).toEqual(['scs']);
    expect(t.doc['isArchived']).toBe(false);
    expect(t.doc['completionDate']).toBe('');
    expect((t.doc['assignee'] as AvatarInfo).key).toBe('pR');
    expect(t.doc['notes']).toContain('https://app.example/course/table/k1');
  });

  it('writes the system avatar as author, never null (the tasks rule reads author.key on every update)', () => {
    const author = buildCourseEndTask(c(), 'https://a', '20261101').doc['author'] as AvatarInfo;
    expect(author).not.toBeNull();
    expect(author.key).toBe('');
    expect(author.label).toBe('System');
  });

  it('uses the given assignee when there is no responsible person', () => {
    const t = buildCourseEndTask(c({ responsiblePersons: [] }), 'https://app.example', '20261101', pA);
    expect((t.doc['assignee'] as AvatarInfo).key).toBe('pA');
  });

  it('rolls the due date over a month and year boundary', () => {
    expect(buildCourseEndTask(c(), 'https://a', '20261225').doc['dueDate']).toBe('20270108');
  });

  it('caps the name at 200 characters', () => {
    expect((buildCourseEndTask(c({ name: 'x'.repeat(300) }), 'https://a', '20261101').doc['name'] as string).length).toBe(200);
  });
});

/** A tiny Firestore double: only what createCourseEndTasks touches. */
function fakeDb(opts: { groups?: Record<string, unknown>; appConfig?: Record<string, unknown>; createFails?: boolean } = {}) {
  const created: { path: string; data: Record<string, unknown> }[] = [];
  const updated: { path: string; data: Record<string, unknown> }[] = [];
  const ref = (path: string) => ({ path });
  const batch = () => {
    const ops: (() => void)[] = [];
    return {
      create: (r: { path: string }, data: Record<string, unknown>) => { ops.push(() => created.push({ path: r.path, data })); },
      update: (r: { path: string }, data: Record<string, unknown>) => { ops.push(() => updated.push({ path: r.path, data })); },
      commit: vi.fn(async () => {
        if (opts.createFails) throw Object.assign(new Error('exists'), { code: 6 });
        ops.forEach((op) => op());
      }),
    };
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...ref(`${name}/${id}`),
        get: async () => ({ data: () => (name === 'groups' ? opts.groups?.[id] : opts.appConfig) }),
        update: async (data: Record<string, unknown>) => { updated.push({ path: `${name}/${id}`, data }); },
      }),
    }),
    batch,
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, created, updated };
}

describe('createCourseEndTasks', () => {
  it('creates the task and sets endTaskKey in one batch', async () => {
    const { db, created, updated } = fakeDb({ appConfig: { appDomain: 'example.org' } });
    const n = await createCourseEndTasks(db, [c()], '20261101');
    expect(n).toBe(1);
    expect(created.map((x) => x.path)).toEqual(['tasks/course-k1-end']);
    expect(created[0].data['notes']).toContain('https://app.example.org/course/table/k1');
    expect(updated).toEqual([{ path: 'courses/k1', data: { endTaskKey: 'course-k1-end' } }]);
  });

  it('falls back to the first admin of the group when nobody is responsible', async () => {
    const { db, created } = fakeDb({ groups: { g1: { admins: [pA, person('pB')] } } });
    await createCourseEndTasks(db, [c({ responsiblePersons: [] })], '20261101');
    expect((created[0].data['assignee'] as AvatarInfo).key).toBe('pA');
  });

  it('skips a course with neither responsible person nor group admin', async () => {
    const { db, created, updated } = fakeDb({ groups: { g1: { admins: [] } } });
    const n = await createCourseEndTasks(db, [c({ responsiblePersons: [] })], '20261101');
    expect(n).toBe(0);
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('on ALREADY_EXISTS (an earlier run died between the writes) only sets endTaskKey', async () => {
    const { db, updated } = fakeDb({ createFails: true });
    const n = await createCourseEndTasks(db, [c()], '20261101');
    expect(n).toBe(1);
    expect(updated).toEqual([{ path: 'courses/k1', data: { endTaskKey: 'course-k1-end' } }]);
  });
});
