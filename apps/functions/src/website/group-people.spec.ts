import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { loadGroupPeople, loadRolePeople, loadRolePortraits, loadSectionPeople, withAvatarImages } from './group-people';

type Doc = Record<string, unknown>;

/** A fake Firestore: memberships answer a where-chain (recorded), persons and responsibilities answer getAll. */
function fakeGroupDb(memberships: Doc[], persons: Record<string, Doc>, roles: Record<string, Doc> = {}, avatars: Record<string, Doc> = {}) {
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
      return refs.map((r) => ({ id: r.id, data: () => (r.path.startsWith('persons/') ? persons[r.id] : r.path.startsWith('responsibilities/') ? roles[r.id] : r.path.startsWith('avatars/') ? avatars[r.id] : undefined) }));
    },
  };
  return { db: db as unknown as Firestore, queries, reads };
}

const m = (memberKey: string, name2: string, extra: Doc = {}): Doc => ({
  orgKey: 'vorstand', orgModelType: 'group', memberKey, memberModelType: 'person', memberName1: 'X', memberName2: name2,
  tenants: ['scs'], isArchived: false, dateOfExit: '99991231', ...extra,
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

const anna = { key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person' };
const beat = { key: 'p2', name1: 'Beat', name2: 'Privat', modelType: 'person' };
const roles: Record<string, Doc> = {
  praesident: { name: 'Präsident', email: 'praesident@seeclub.org', tenants: ['scs'], responsibleAvatar: anna, delegateAvatar: beat },
  kassier: { name: 'Kassier', tenants: ['scs'], responsibleAvatar: anna, delegateAvatar: { key: 'g1', name2: 'Vorstand', modelType: 'group' } },
};
const rolePersons: Record<string, Doc> = { p1: { tenants: ['scs'], usageName: 0 }, p2: { tenants: ['scs'], usageName: 1 } };

describe('loadRolePeople', () => {
  it('reads the roles, then the persons of their person avatars, by key, and resolves each list', async () => {
    const f = fakeGroupDb([], rolePersons, roles);
    const out = await loadRolePeople(f.db, [['praesident', 'kassier'], ['kassier']], ['scs']);
    expect(f.queries).toEqual([]);
    expect(f.reads).toEqual([
      ['responsibilities/praesident', 'responsibilities/kassier'],
      ['persons/p1', 'persons/p2'],
      ['avatars/scs.responsibility.praesident', 'avatars/scs.responsibility.kassier'],
    ]);
    expect(out.get('praesident,kassier')).toEqual([
      { key: 'p1', firstName: 'Anna', lastName: 'Muster', label: 'Präsident, Kassier', showImage: true, email: 'praesident@seeclub.org' },
    ]);
    expect(out.get('kassier')?.map((p) => [p.key, p.email])).toEqual([['p1', undefined]]);
  });

  it("shows a role's own portrait for its responsible instead of the person's avatar", async () => {
    const f = fakeGroupDb([], { p1: { tenants: ['scs'], usageName: 0 }, p2: { tenants: ['scs'], usageName: 0 } }, roles, {
      'scs.responsibility.praesident': { storagePath: 'tenant/scs/responsibility/praesident/avatar/x.jpg' },
    });
    const out = await loadRolePeople(f.db, [['praesident']], ['scs']);
    expect(out.get('praesident')?.map((p) => [p.key, p.image])).toEqual([
      ['p1', 'tenant/scs/responsibility/praesident/avatar/x.jpg'],
      ['p2', undefined], // the delegate never takes the role's portrait
    ]);
  });

  it('reads nothing without roles or tenants', async () => {
    const f = fakeGroupDb([], rolePersons, roles);
    expect((await loadRolePeople(f.db, [], ['scs'])).size).toBe(0);
    expect((await loadRolePeople(f.db, [['praesident']], [])).size).toBe(0);
    expect(f.reads).toEqual([]);
  });
});

describe('loadSectionPeople', () => {
  it('keys group and role sections by their source, and reads nothing for persons lists', async () => {
    const f = fakeGroupDb([m('p1', 'Muster')], { ...rolePersons }, roles);
    const out = await loadSectionPeople(f.db, [
      { type: 'people', properties: { type: 'group', groupId: 'vorstand' } },
      { type: 'people', properties: { type: 'responsibility', responsibilityIds: ['praesident'] } },
      { type: 'people', properties: { type: 'responsibility', responsibilityId: 'kassier' } },
      { type: 'people', properties: { type: 'persons', persons: [{ key: 'p9' }] } },
      { type: 'article', properties: { type: 'group', groupId: 'geheim' } },
      undefined,
    ], ['scs'], '20261113');
    expect([...out.keys()].sort()).toEqual(['group.vorstand', 'responsibility.kassier', 'responsibility.praesident']);
    expect(f.queries).toHaveLength(1);
    expect(out.get('responsibility.praesident')?.map((p) => p.key)).toEqual(['p1']);
    expect(f.reads.flat()).not.toContain('persons/p9');
  });

  it('reads nothing when no section takes its people from a group or roles', async () => {
    const f = fakeGroupDb([], {}, {});
    expect((await loadSectionPeople(f.db, [{ type: 'people', properties: { type: 'persons' } }], ['scs'])).size).toBe(0);
    expect(f.queries).toEqual([]);
    expect(f.reads).toEqual([]);
  });
});

describe('loadRolePortraits', () => {
  it("takes the tenant's portrait only when its path is the role's own upload folder", async () => {
    const f = fakeGroupDb([], {}, {}, {
      'scs.responsibility.a': { storagePath: 'tenant/scs/responsibility/a/avatar/x.jpg' },
      'scs.responsibility.b': { storagePath: 'tenant/scs/person/p1/avatar/y.jpg' }, // foreign path: ignored
      'responsibility.c': { storagePath: 'tenant/scs/responsibility/c/avatar/z.jpg' }, // bare doc: not read
    });
    const out = await loadRolePortraits(f.db, ['a', 'b', 'c'], 'scs');
    expect([...out.entries()]).toEqual([['a', 'tenant/scs/responsibility/a/avatar/x.jpg']]);
    expect(f.reads.flat()).not.toContain('avatars/responsibility.c');
  });

  it('reads nothing without a tenant', async () => {
    const f = fakeGroupDb([], {}, {}, {});
    expect((await loadRolePortraits(f.db, ['a'], undefined)).size).toBe(0);
    expect(f.reads).toEqual([]);
  });
});

describe('withAvatarImages', () => {
  function fakeAvatarDb(avatars: Record<string, Doc>) {
    const reads: string[][] = [];
    const db = {
      collection: (c: string) => ({ doc: (id: string) => ({ path: `${c}/${id}`, id }) }),
      getAll: async (...refs: { path: string; id: string }[]) => {
        reads.push(refs.map((r) => r.path));
        return refs.map((r) => ({ id: r.id, data: () => avatars[r.id] }));
      },
    };
    return { db: db as unknown as Firestore, reads };
  }

  it('takes the tenant avatar first, then the shared one, only for persons whose images are public (no flag = no photo)', async () => {
    const f = fakeAvatarDb({
      'scs.person.p1': { storagePath: 'tenant/scs/person/p1/avatar/a.jpg' },
      'person.p1': { storagePath: 'shared/a.jpg' },
      'person.p2': { storagePath: 'shared/b.jpg' },
      'person.p5': { storagePath: 'shared/e.jpg' },
      'scs.person.p3': { storagePath: 'tenant/scs/person/p3/avatar/c.jpg' },
    });
    const people = new Map([['group.vorstand', [
      { key: 'p1', firstName: 'A', lastName: '', label: '', showImage: true },
      { key: 'p2', firstName: 'B', lastName: '', label: '', showImage: true },
      { key: 'p5', firstName: 'E', lastName: '', label: '' },
      { key: 'p3', firstName: 'C', lastName: '', label: '', showImage: false },
      { key: 'p4', firstName: 'D', lastName: '', label: '', showImage: true },
    ]]]);
    const out = await withAvatarImages(f.db, people, 'scs');
    expect(out.get('group.vorstand')?.map((p) => p.image)).toEqual(['tenant/scs/person/p1/avatar/a.jpg', 'shared/b.jpg', undefined, undefined, undefined]); // p5: no flag = no photo (fail closed)
    expect(f.reads.flat()).not.toContain('avatars/scs.person.p3');
    expect(f.reads.flat()).not.toContain('avatars/person.p5');
  });

  it('keeps an image that is already set (a role portrait) and does not read its avatar', async () => {
    const f = fakeAvatarDb({ 'person.p1': { storagePath: 'shared/a.jpg' } });
    const people = new Map([['responsibility.r', [{ key: 'p1', firstName: 'A', lastName: '', label: '', showImage: true, image: 'portrait.jpg' }]]]);
    const out = await withAvatarImages(f.db, people, 'scs');
    expect(out.get('responsibility.r')?.[0].image).toBe('portrait.jpg');
    expect(f.reads).toEqual([]);
  });
});
