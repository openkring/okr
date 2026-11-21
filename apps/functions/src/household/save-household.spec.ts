import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError: class HttpsError extends Error { constructor(public code: string, m: string) { super(m); } },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('@okr/shared-util-functions', () => ({ checkAppCheckToken: vi.fn(), checkAuthentication: vi.fn() }));

import type { Firestore } from 'firebase-admin/firestore';
import { addedMemberKeys, callerInTenant, isHouseholdAdmin, isMemberOfTenant, isOnlyTenant, readIncoming, runSaveHousehold } from './save-household';

describe('callerInTenant', () => {
  it('accepts a tenant the caller belongs to', () => {
    expect(callerInTenant(['scs', 'kring'], 'scs')).toBe(true);
  });
  it('refuses another tenant, an empty tenant and a missing tenants list', () => {
    expect(callerInTenant(['scs'], 'gvs')).toBe(false);
    expect(callerInTenant(['scs', ''], '')).toBe(false);
    expect(callerInTenant(undefined, 'scs')).toBe(false);
    expect(callerInTenant('scs', 'scs')).toBe(false);
  });
});

describe('isOnlyTenant', () => {
  it('is true only for exactly [tenantId]', () => {
    expect(isOnlyTenant(['scs'], 'scs')).toBe(true);
    expect(isOnlyTenant(['scs', 'kring'], 'scs')).toBe(false);
    expect(isOnlyTenant(['gvs'], 'scs')).toBe(false);
    expect(isOnlyTenant([], 'scs')).toBe(false);
    expect(isOnlyTenant(undefined, 'scs')).toBe(false);
    expect(isOnlyTenant('scs', 'scs')).toBe(false);
  });
});

describe('isHouseholdAdmin', () => {
  it('is true for memberAdmin, privileged and admin', () => {
    expect(isHouseholdAdmin({ memberAdmin: true })).toBe(true);
    expect(isHouseholdAdmin({ privileged: true })).toBe(true);
    expect(isHouseholdAdmin({ admin: true })).toBe(true);
  });
  it('is false for a plain member and for truthy non-boolean values', () => {
    expect(isHouseholdAdmin({ registered: true })).toBe(false);
    expect(isHouseholdAdmin({ admin: 'true' })).toBe(false);
    expect(isHouseholdAdmin({})).toBe(false);
  });
});

describe('readIncoming', () => {
  it('refuses a non-object', () => {
    expect(readIncoming(undefined, 'scs')).toBeUndefined();
    expect(readIncoming(null, 'scs')).toBeUndefined();
    expect(readIncoming('x', 'scs')).toBeUndefined();
  });
  it('keeps only known fields, coerced', () => {
    const h = readIncoming({
      okey: 'h1', tenants: ['scs', 7], isArchived: 'yes', name: 'Familie Muster', type: 3,
      memberKeys: ['a', 2, 'b'], payerKey: 'a', contactKey: 'b', bundle: { post: false, email: 'x', evil: true }, extra: 'drop',
    }, 'scs');
    expect(h).toMatchObject({
      okey: 'h1', tenants: ['scs'], isArchived: false, name: 'Familie Muster', type: '',
      memberKeys: ['a', 'b'], payerKey: 'a', contactKey: 'b', bundle: { post: false, email: false, inApp: false },
    });
    expect(h).not.toHaveProperty('extra');
  });
  it('defaults missing strings to empty', () => {
    expect(readIncoming({}, 'scs')).toMatchObject({ okey: '', name: '', memberKeys: [], payerKey: '', contactKey: '', tenants: [] });
  });
});

// ---- runSaveHousehold with a small in-memory Firestore ------------------------------------------------

type Doc = Record<string, unknown>;

function fakeDb(seed: Record<string, Record<string, Doc>>) {
  const data: Record<string, Record<string, Doc>> = structuredClone(seed);
  let nextId = 0;
  const snap = (col: string, id: string) => ({ id, exists: data[col]?.[id] !== undefined, data: () => data[col]?.[id], get: (f: string) => data[col]?.[id]?.[f] });
  const ref = (col: string, id: string) => ({ col, id, path: `${col}/${id}`, get: async () => snap(col, id) });
  const collection = (col: string) => ({
    doc: (id?: string) => ref(col, id ?? `new${++nextId}`),
    where: (field: string, op: string, values: unknown[]) => ({
      isQuery: true,
      run: () => ({
        docs: Object.keys(data[col] ?? {})
          .filter((id) => op === 'array-contains-any' && ((data[col][id][field] as unknown[]) ?? []).some((v) => values.includes(v)))
          .map((id) => snap(col, id)),
      }),
    }),
  });
  const db = {
    collection,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (r: { isQuery?: boolean; run?: () => unknown; col?: string; id?: string }) =>
          (r.isQuery ? (r.run as () => unknown)() : snap(r.col as string, r.id as string)),
        getAll: async (...refs: { col: string; id: string }[]) => refs.map((r) => snap(r.col, r.id)),
        set: (r: { col: string; id: string }, d: Doc) => { writes.push(() => { (data[r.col] ??= {})[r.id] = structuredClone(d); }); return tx; },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
  return { db: db as unknown as Firestore, data };
}

const person = (tenants: string[] = ['scs'], isArchived = false) => ({ firstName: 'X', lastName: 'Muster', tenants, isArchived });
const seed = (): Record<string, Record<string, Doc>> => ({
  users: {
    admin: { tenants: ['scs'], personKey: 'adminP', roles: { memberAdmin: true } },
    member: { tenants: ['scs'], personKey: 'a', roles: { registered: true } },
    foreignAdmin: { tenants: ['gvs'], personKey: 'g', roles: { memberAdmin: true } },
  },
  persons: { a: person(), b: person(), c: person(), d: person(), x: person(['gvs']), z: person(['scs'], true) },
  households: {
    h1: { tenants: ['scs'], isArchived: false, name: 'Familie Muster', type: 'family', index: 'n:familie muster', tags: '', notes: '',
      memberKeys: ['a', 'b'], payerKey: 'a', contactKey: 'a', bundle: { post: true, email: false, inApp: false } },
    hForeign: { tenants: ['gvs'], isArchived: false, name: 'Familie Fremd', type: 'family', index: '', tags: '', notes: '',
      memberKeys: ['c', 'b'], payerKey: 'c', contactKey: 'c', bundle: { post: true, email: false, inApp: false } },
  },
});
const newHousehold = (over: Doc = {}) => ({ okey: '', tenants: ['scs'], isArchived: false, name: 'Familie Neu', type: 'family', tags: '', notes: '',
  memberKeys: ['c', 'd'], payerKey: 'c', contactKey: 'c', bundle: { post: true, email: false, inApp: false }, ...over });

async function refusal(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return { code: (e as { code: string }).code, message: (e as Error).message };
  }
  throw new Error('expected a refusal');
}

describe('runSaveHousehold', () => {
  it('creates a household for an admin and stores it with the tenant and the server index', async () => {
    const fake = fakeDb(seed());
    const { okey } = await runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: newHousehold() as never });
    const stored = fake.data['households'][okey];
    expect(stored).toMatchObject({ tenants: ['scs'], isArchived: false, name: 'Familie Neu', memberKeys: ['c', 'd'] });
    expect(String(stored['index'])).toMatch(/familie neu/i);
    expect(stored).not.toHaveProperty('okey');
  });

  it('refuses a request tenant the caller does not belong to', async () => {
    const fake = fakeDb(seed());
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'gvs', household: newHousehold({ tenants: ['gvs'] }) as never })))
      .toEqual({ code: 'permission-denied', message: 'tenant-not-allowed' });
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: '', household: newHousehold() as never })))
      .toEqual({ code: 'permission-denied', message: 'tenant-not-allowed' });
  });

  it('refuses a memberAdmin whose users doc does not include the tenant', async () => {
    const fake = fakeDb(seed());
    expect(await refusal(runSaveHousehold(fake.db, 'foreignAdmin', { tenantId: 'scs', household: newHousehold() as never })))
      .toEqual({ code: 'permission-denied', message: 'tenant-not-allowed' });
    expect(Object.keys(fake.data['households'])).toEqual(['h1', 'hForeign']);
  });

  it('refuses to overwrite a stored household of another tenant', async () => {
    const fake = fakeDb(seed());
    const household = { ...seed()['households']['hForeign'], okey: 'hForeign', tenants: ['scs'] };
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: household as never })))
      .toEqual({ code: 'permission-denied', message: 'tenants-changed' });
    expect(fake.data['households']['hForeign']['tenants']).toEqual(['gvs']);
  });

  it('refuses incoming tenants other than exactly [tenantId]', async () => {
    const fake = fakeDb(seed());
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: newHousehold({ tenants: ['scs', 'gvs'] }) as never })))
      .toEqual({ code: 'permission-denied', message: 'tenants-changed' });
  });

  it('refuses a member editing an archived household', async () => {
    const data = seed();
    data['households']['h1']['isArchived'] = true;
    const fake = fakeDb(data);
    const household = { ...data['households']['h1'], okey: 'h1', name: 'Familie Muster-Neu' };
    expect(await refusal(runSaveHousehold(fake.db, 'member', { tenantId: 'scs', household: household as never })))
      .toEqual({ code: 'permission-denied', message: 'not-allowed' });
    expect(fake.data['households']['h1']['name']).toBe('Familie Muster');
  });

  it('lets a member rename their own live household', async () => {
    const fake = fakeDb(seed());
    const household = { ...seed()['households']['h1'], okey: 'h1', name: 'Familie Muster-Neu' };
    expect(await runSaveHousehold(fake.db, 'member', { tenantId: 'scs', household: household as never })).toEqual({ okey: 'h1' });
    expect(fake.data['households']['h1']['name']).toBe('Familie Muster-Neu');
  });

  it.each([
    ['of another tenant', 'x'],
    ['archived', 'z'],
    ['missing', 'nobody'],
    ['not a document id', 'a/b'],
  ])('refuses a member person that is %s', async (_why, key) => {
    const fake = fakeDb(seed());
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: newHousehold({ memberKeys: ['c', key] }) as never })))
      .toEqual({ code: 'invalid-argument', message: 'member-not-in-tenant' });
    expect(Object.keys(fake.data['households'])).toEqual(['h1', 'hForeign']);
  });

  it('lets a member leave although another member\'s person is archived', async () => {
    const data = seed();
    data['households']['h1']['memberKeys'] = ['a', 'b', 'z'];
    const fake = fakeDb(data);
    const household = { ...data['households']['h1'], okey: 'h1', memberKeys: ['b', 'z'], payerKey: 'b', contactKey: 'b' };
    expect(await runSaveHousehold(fake.db, 'member', { tenantId: 'scs', household: household as never })).toEqual({ okey: 'h1' });
    expect(fake.data['households']['h1']['memberKeys']).toEqual(['b', 'z']);
  });

  it('lets a member rename a household that holds an archived person', async () => {
    const data = seed();
    data['households']['h1']['memberKeys'] = ['a', 'b', 'z'];
    const fake = fakeDb(data);
    const household = { ...data['households']['h1'], okey: 'h1', name: 'Familie Muster-Neu' };
    expect(await runSaveHousehold(fake.db, 'member', { tenantId: 'scs', household: household as never })).toEqual({ okey: 'h1' });
  });

  it('still refuses an admin adding a person of another tenant to an existing household', async () => {
    const fake = fakeDb(seed());
    const household = { ...seed()['households']['h1'], okey: 'h1', memberKeys: ['a', 'b', 'x'] };
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: household as never })))
      .toEqual({ code: 'invalid-argument', message: 'member-not-in-tenant' });
  });

  it('re-checks every member when an admin un-archives a household', async () => {
    const data = seed();
    data['households']['h1'] = { ...data['households']['h1'], isArchived: true, memberKeys: ['a', 'b', 'z'] };
    const fake = fakeDb(data);
    const household = { ...data['households']['h1'], okey: 'h1' };
    expect(await refusal(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: household as never, archive: false })))
      .toEqual({ code: 'invalid-argument', message: 'member-not-in-tenant' });
    expect(fake.data['households']['h1']['isArchived']).toBe(true);
  });

  it('accepts a person shared with another tenant when it lists this tenant', async () => {
    const data = seed();
    data['persons']['c'] = person(['gvs', 'scs']);
    const fake = fakeDb(data);
    await expect(runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: newHousehold() as never })).resolves.toHaveProperty('okey');
  });
});

describe('addedMemberKeys', () => {
  it('returns every key for a new household', () => {
    expect(addedMemberKeys(undefined, { memberKeys: ['a', 'b'] })).toEqual(['a', 'b']);
  });
  it('returns only the keys a write adds, deduplicated', () => {
    expect(addedMemberKeys({ memberKeys: ['a', 'b'] }, { memberKeys: ['b', 'c', 'c'] })).toEqual(['c']);
  });
  it('returns nothing when members only leave', () => {
    expect(addedMemberKeys({ memberKeys: ['a', 'b', 'z'] }, { memberKeys: ['b', 'z'] })).toEqual([]);
  });
});

describe('isMemberOfTenant', () => {
  it('accepts a live person listing the tenant', () => {
    expect(isMemberOfTenant({ tenants: ['gvs', 'scs'] }, 'scs')).toBe(true);
  });
  it('refuses a missing, archived or foreign person', () => {
    expect(isMemberOfTenant(undefined, 'scs')).toBe(false);
    expect(isMemberOfTenant({ tenants: ['scs'], isArchived: true }, 'scs')).toBe(false);
    expect(isMemberOfTenant({ tenants: ['gvs'] }, 'scs')).toBe(false);
    expect(isMemberOfTenant({}, 'scs')).toBe(false);
  });
});

describe('runSaveHousehold — dissolving', () => {
  it('lets an admin archive a household whose member person is archived', async () => {
    const data = seed();
    (data['persons']['b'] as Doc)['isArchived'] = true;
    const fake = fakeDb(data);
    const household = { ...data['households']['h1'], okey: 'h1' };
    await runSaveHousehold(fake.db, 'admin', { tenantId: 'scs', household: household as never, archive: true });
    expect(fake.data['households']['h1']['isArchived']).toBe(true);
  });
});
