import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { groupIdOfSection, loadGroupPeople } from './group-people';

type Doc = Record<string, unknown>;

/** A fake Firestore: memberships answer a where-chain (recorded), persons answer getAll. */
function fakeGroupDb(memberships: Doc[], persons: Record<string, Doc>) {
  const queries: string[][] = [];
  const reads: string[][] = [];
  const query = (clauses: string[]) => ({
    where: (f: string, op: string, v: unknown) => query([...clauses, `${f} ${op} ${JSON.stringify(v)}`]),
    orderBy: (f: string, dir: string) => query([...clauses, `orderBy ${f} ${dir}`]),
    get: async () => {
      queries.push(clauses);
      const orgKey = clauses.find((c) => c.startsWith('orgKey =='))?.split(' == ')[1];
      return { docs: memberships.filter((m) => JSON.stringify(m['orgKey']) === orgKey).map((m) => ({ data: () => m })) };
    },
  });
  const db = {
    collection: (c: string) => ({ ...query([c]), doc: (id: string) => ({ path: `${c}/${id}`, id }) }),
    getAll: async (...refs: { path: string; id: string }[]) => {
      reads.push(refs.map((r) => r.path));
      return refs.map((r) => ({ id: r.id, data: () => (r.path.startsWith('persons/') ? persons[r.id] : undefined) }));
    },
  };
  return { db: db as unknown as Firestore, queries, reads };
}

const m = (memberKey: string, name2: string, extra: Doc = {}): Doc => ({
  orgKey: 'vorstand', orgModelType: 'group', memberKey, memberModelType: 'person', memberName1: 'X', memberName2: name2,
  tenants: ['scs'], isArchived: false, dateOfExit: '99991231', ...extra,
});

describe('groupIdOfSection', () => {
  it('is the group key of a people section in group mode only', () => {
    expect(groupIdOfSection({ type: 'people', properties: { type: 'group', groupId: 'vorstand' } })).toBe('vorstand');
    expect(groupIdOfSection({ type: 'people', properties: { type: 'persons', groupId: 'vorstand' } })).toBe('');
    expect(groupIdOfSection({ type: 'article', properties: { type: 'group', groupId: 'vorstand' } })).toBe('');
    expect(groupIdOfSection({ type: 'people', properties: { type: 'group', groupId: 'a/b' } })).toBe('');
    expect(groupIdOfSection({ type: 'people', properties: { type: 'group' } })).toBe('');
    expect(groupIdOfSection(undefined)).toBe('');
  });
});

describe('loadGroupPeople', () => {
  it('runs one tenant-scoped, index-backed query per group, reads the persons by key and resolves them', async () => {
    const f = fakeGroupDb(
      [m('p1', 'Muster'), m('p2', 'Bauer'), m('p3', 'Ende', { dateOfExit: '20200101' }), m('p1', 'Muster', { orgKey: 'jugend' })],
      { p1: { tenants: ['scs'], usageName: 0 }, p2: { tenants: ['scs'], usageName: 1 }, p3: { tenants: ['scs'], usageName: 0 } },
    );
    const out = await loadGroupPeople(f.db, ['vorstand', 'jugend', 'vorstand'], ['scs'], '20261113');
    expect(f.queries).toHaveLength(2);
    expect(f.queries[0]).toEqual([
      'memberships',
      'tenants array-contains-any ["scs"]',
      'isArchived == false',
      'memberModelType == "person"',
      'orgKey == "vorstand"',
      'orgModelType == "group"',
      'orderBy memberName2 asc',
    ]);
    expect(f.reads).toEqual([['persons/p1', 'persons/p2', 'persons/p3']]);
    expect(out.get('vorstand')).toEqual([{ key: 'p1', firstName: 'X', lastName: 'Muster', label: '', showImage: true }]);
    expect(out.get('jugend')?.map((p) => p.key)).toEqual(['p1']);
  });

  it('reads nothing without groups or tenants', async () => {
    const f = fakeGroupDb([m('p1', 'A')], {});
    expect((await loadGroupPeople(f.db, [], ['scs'])).size).toBe(0);
    expect((await loadGroupPeople(f.db, ['vorstand'], [])).size).toBe(0);
    expect(f.queries).toEqual([]);
    expect(f.reads).toEqual([]);
  });
});
