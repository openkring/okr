import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AcceptanceSettings } from '@okr/shared-util-core';

import { decideSlot, persistWithSlot, readResponseCount } from './form-stats';

/** In-memory fake of `db.collection().doc()` and `db.runTransaction(fn)` — enough for the counter. */
function fakeDb(initial: Record<string, Record<string, unknown>> = {}) {
  const store: Record<string, Record<string, unknown>> = { ...initial };
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: path in store, data: () => store[path] }),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (r: { path: string }) => ({ exists: r.path in store, data: () => store[r.path] }),
        set: (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          writes.push(() => { store[r.path] = opts?.merge ? { ...(store[r.path] ?? {}), ...data } : { ...data }; });
        },
        update: (r: { path: string }, data: Record<string, unknown>) => {
          writes.push(() => {
            if (!(r.path in store)) throw new Error('NOT_FOUND'); // like Firestore: update never creates
            store[r.path] = { ...store[r.path], ...data };
          });
        },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const settings = (statsId: string, maxResponses: number): AcceptanceSettings => ({
  isOpen: true, closesAt: '', maxResponses, showRemaining: false, closedMessage: '', statsId,
});

describe('decideSlot', () => {
  it('takes the first place of a new counter', () => {
    expect(decideSlot(undefined, 0)).toEqual({ accept: true, next: 1 });
  });
  it('takes the last place', () => {
    expect(decideSlot(1, 2)).toEqual({ accept: true, next: 2 });
  });
  it('refuses when full', () => {
    expect(decideSlot(2, 2).accept).toBe(false);
  });
  it('unlimited still counts', () => {
    expect(decideSlot(5, 0)).toEqual({ accept: true, next: 6 });
  });
});

describe('readResponseCount', () => {
  it('reads the count, 0 for a missing or malformed document', async () => {
    const { db } = fakeDb({ 'formStats/f1': { responseCount: 3 }, 'formStats/f2': { responseCount: 'x' } });
    expect(await readResponseCount(db, 'f1')).toBe(3);
    expect(await readResponseCount(db, 'f2')).toBe(0);
    expect(await readResponseCount(db, 'f3')).toBe(0);
  });
});

describe('persistWithSlot', () => {
  it('limit refuses the 3rd', async () => {
    const { db, store } = fakeDb();
    const write = vi.fn(async () => 'id');
    await persistWithSlot(db, settings('f1', 2), 'scs', false, write);
    await persistWithSlot(db, settings('f1', 2), 'scs', false, write);
    const third = vi.fn(async () => 'id3');
    await expect(persistWithSlot(db, settings('f1', 2), 'scs', false, third)).rejects.toMatchObject({
      code: 'failed-precondition', message: 'form-full',
    });
    expect(third).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(2);
    expect(store['formStats/f1']).toEqual({ tenants: ['scs'], responseCount: 2 });
  });

  it('spam not counted', async () => {
    const { db, store } = fakeDb({ 'formStats/f1': { tenants: ['scs'], responseCount: 1 } });
    const write = vi.fn(async () => 'spam-id');
    expect(await persistWithSlot(db, settings('f1', 2), 'scs', true, write)).toBe('spam-id');
    expect(write).toHaveBeenCalledTimes(1);
    expect(store['formStats/f1']['responseCount']).toBe(1);
  });

  it('spam is written even when the form is full (no tell)', async () => {
    const { db } = fakeDb({ 'formStats/f1': { tenants: ['scs'], responseCount: 2 } });
    const write = vi.fn(async () => 'spam-id');
    expect(await persistWithSlot(db, settings('f1', 2), 'scs', true, write)).toBe('spam-id');
  });

  it('failed write gives the place back', async () => {
    const { db, store } = fakeDb({ 'formStats/f1': { tenants: ['scs'], responseCount: 1 } });
    const boom = new Error('write failed');
    await expect(persistWithSlot(db, settings('f1', 2), 'scs', false, async () => { throw boom; })).rejects.toBe(boom);
    expect(store['formStats/f1']['responseCount']).toBe(1);
  });

  it('giving back never goes below 0', async () => {
    const { db, store } = fakeDb();
    const failing = async () => {
      store['formStats/f1'] = { tenants: ['scs'], responseCount: 0 }; // someone reset the count meanwhile
      throw new Error('x');
    };
    await expect(persistWithSlot(db, settings('f1', 0), 'scs', false, failing)).rejects.toThrow('x');
    expect(store['formStats/f1']['responseCount']).toBe(0);
  });

  it('never overwrites tenants: a shared form keeps every tenant, a new one is added', async () => {
    const { db, store } = fakeDb({ 'formStats/f1': { tenants: ['scs', 'kring'], responseCount: 1 } });
    await persistWithSlot(db, settings('f1', 0), 'kring', false, async () => 'id');
    expect(store['formStats/f1']).toEqual({ tenants: ['scs', 'kring'], responseCount: 2 });
    await persistWithSlot(db, settings('f1', 0), 'p13', false, async () => 'id');
    expect(store['formStats/f1']['tenants']).toEqual(['scs', 'kring', 'p13']);
  });

  it('giving back does not re-create a counter removed meanwhile', async () => {
    const { db, store } = fakeDb();
    const failing = async () => {
      delete store['formStats/f1'];
      throw new Error('x');
    };
    await expect(persistWithSlot(db, settings('f1', 2), 'scs', false, failing)).rejects.toThrow('x');
    expect('formStats/f1' in store).toBe(false);
  });

  it('section counted separately', async () => {
    const { db, store } = fakeDb({ 'formStats/f1': { tenants: ['scs'], responseCount: 5 } });
    await persistWithSlot(db, settings('f1__s1', 3), 'scs', false, async () => 'id');
    expect(store['formStats/f1__s1']['responseCount']).toBe(1);
    expect(store['formStats/f1']['responseCount']).toBe(5);
  });

  it('returns the id the write produced', async () => {
    const { db } = fakeDb();
    expect(await persistWithSlot(db, settings('f1', 0), 'scs', false, async () => 'abc')).toBe('abc');
  });
});
