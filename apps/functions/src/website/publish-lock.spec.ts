import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { acquireLock, closeLock, LOCK_TTL_MS } from './publish-lock';

/** In-memory stand-in for the slice of Firestore the lock uses: one subcollection, `==` queries, transactions. */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  let auto = 0;
  const docRef = (path: string) => ({
    path,
    id: path.split('/').pop() as string,
    update: async (data: Record<string, unknown>) => {
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    },
  });
  const collection = (path: string) => ({
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++auto}`}`),
    where: (field: string, _op: '==', value: unknown) => ({
      __query: true,
      run: () =>
        [...docs.entries()]
          .filter(([p, d]) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1 && d[field] === value)
          .map(([p, d]) => ({ id: p.split('/').pop() as string, ref: docRef(p), data: () => d })),
    }),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({ collection: (sub: string) => collection(`${name}/${id}/${sub}`) }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (q: { run: () => unknown[] }) => ({ docs: q.run() }),
        set: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, data),
        update: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data }),
      }),
  };
  return { db: db as unknown as Firestore, docs };
}

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('acquireLock', () => {
  it('creates a running publishes doc when nothing runs', async () => {
    const { db, docs } = fakeDb();
    const lock = await acquireLock(db, 'scs', 'pA', ['scs'], NOW);
    expect(lock).toBeDefined();
    const doc = docs.get(`websites/scs/publishes/${lock?.id}`);
    expect(doc).toEqual({ state: 'running', startedAt: NOW.toISOString(), startedBy: 'pA', tenants: ['scs'] });
  });

  it('refuses while another run is younger than 5 minutes', async () => {
    const { db, docs } = fakeDb();
    docs.set('websites/scs/publishes/other', { state: 'running', startedAt: ago(LOCK_TTL_MS - 1000), startedBy: 'pB', tenants: ['scs'] });
    const lock = await acquireLock(db, 'scs', 'pA', ['scs'], NOW);
    expect(lock).toBeUndefined();
    expect(docs.size).toBe(1);
    expect(docs.get('websites/scs/publishes/other')?.['state']).toBe('running');
  });

  it('takes over a run older than 5 minutes and marks it failed', async () => {
    const { db, docs } = fakeDb();
    docs.set('websites/scs/publishes/stale', { state: 'running', startedAt: ago(LOCK_TTL_MS + 1000), startedBy: 'pB', tenants: ['scs'] });
    const lock = await acquireLock(db, 'scs', 'pA', ['scs'], NOW);
    expect(lock).toBeDefined();
    expect(docs.get('websites/scs/publishes/stale')).toMatchObject({ state: 'failed', finishedAt: NOW.toISOString() });
    expect(docs.get(`websites/scs/publishes/${lock?.id}`)?.['state']).toBe('running');
  });

  it('ignores a running doc of another site', async () => {
    const { db, docs } = fakeDb();
    docs.set('websites/other/publishes/x', { state: 'running', startedAt: ago(1000), startedBy: 'pB', tenants: ['other'] });
    expect(await acquireLock(db, 'scs', 'pA', ['scs'], NOW)).toBeDefined();
  });

  it('treats a running doc without a readable start time as stale', async () => {
    const { db, docs } = fakeDb();
    docs.set('websites/scs/publishes/odd', { state: 'running', startedBy: 'pB' });
    expect(await acquireLock(db, 'scs', 'pA', ['scs'], NOW)).toBeDefined();
  });
});

describe('closeLock', () => {
  it('writes the end state, finishedAt and the given fields', async () => {
    const { db, docs } = fakeDb();
    const lock = await acquireLock(db, 'scs', 'pA', ['scs'], NOW);
    const later = new Date(NOW.getTime() + 5000);
    await closeLock(db, 'scs', lock?.id as string, 'done', { version: 'sites/s/versions/v1', files: 3 }, later);
    expect(docs.get(`websites/scs/publishes/${lock?.id}`)).toMatchObject({
      state: 'done',
      finishedAt: later.toISOString(),
      version: 'sites/s/versions/v1',
      files: 3,
      startedBy: 'pA',
    });
  });

  it('drops undefined fields (Firestore rejects them)', async () => {
    const { db, docs } = fakeDb();
    const lock = await acquireLock(db, 'scs', 'pA', ['scs'], NOW);
    await closeLock(db, 'scs', lock?.id as string, 'failed', { detail: 'boom', version: undefined }, NOW);
    expect(Object.keys(docs.get(`websites/scs/publishes/${lock?.id}`) ?? {})).not.toContain('version');
  });
});
