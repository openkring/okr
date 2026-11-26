import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { MailPageCollection, MailPageSectionCollection } from '@okr/shared-models';

import { reapMailPageDrafts } from './mail-page';

type Doc = Record<string, unknown>;
const NOW = '2026-11-26T03:00:00.000Z';
const OLD = '2026-10-01T10:00:00.000Z';

/**
 * The slice of Firestore the reap uses. The query answers with the pages as they were when it ran (`queried`); `beforeTransaction` changes
 * the store between the query and the delete, as a sender continuing or sending a draft would. `log` lists the deletes in their order.
 */
function fakeDb(pages: Record<string, Doc>, sections: Record<string, string[]>, beforeTransaction: (docs: Map<string, Doc>) => void = () => undefined) {
  const docs = new Map<string, Doc>();
  for (const [key, page] of Object.entries(pages)) docs.set(`${MailPageCollection}/${key}`, page);
  for (const [key, ids] of Object.entries(sections)) for (const id of ids) docs.set(`${MailPageCollection}/${key}/${MailPageSectionCollection}/${id}`, { type: 'article' });
  const log: string[] = [];
  const ref = (path: string) => ({
    path, id: path.split('/').pop() as string,
    collection: (sub: string) => ({
      listDocuments: async () => [...docs.keys()].filter((p) => p.startsWith(`${path}/${sub}/`)).map((p) => ({ path: p })),
    }),
  });
  const db = {
    collection: (name: string) => ({
      where: (field: string, _op: '<', value: string) => ({
        get: async () => {
          const queried = [...docs.entries()].filter(([p, d]) => p.split('/').length === 2 && p.startsWith(`${name}/`) && String(d[field]) < value)
            .map(([p, d]) => ({ id: ref(p).id, ref: ref(p), data: () => ({ ...d }) }));
          beforeTransaction(docs);
          return { docs: queried };
        },
      }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const deletes: string[] = [];
      const result = await fn({
        get: async (r: { path: string }) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
        delete: (r: { path: string }) => { deletes.push(r.path); },
      });
      for (const path of deletes) { docs.delete(path); log.push(path); }
      return result;
    },
    batch: () => {
      const deletes: string[] = [];
      return { delete: (r: { path: string }) => deletes.push(r.path), commit: async () => { for (const path of deletes) { docs.delete(path); log.push(path); } } };
    },
  };
  return { db: db as unknown as Firestore, docs, log };
}

const draft = (extra: Doc = {}): Doc => ({ createdAt: OLD, changedAt: OLD, senderUid: 'u', tenants: ['scs'], ...extra });
const page = (key: string) => `${MailPageCollection}/${key}`;
const section = (key: string, id: string) => `${MailPageCollection}/${key}/${MailPageSectionCollection}/${id}`;

describe('reapMailPageDrafts', () => {
  it('deletes an old unsent draft: the page first, then its sections', async () => {
    const { db, docs, log } = fakeDb({ p1: draft() }, { p1: ['a', 'b'] });
    expect(await reapMailPageDrafts(db, NOW)).toBe(1);
    expect(log).toEqual([page('p1'), section('p1', 'a'), section('p1', 'b')]);
    expect(docs.size).toBe(0);
  });

  it('keeps what the pure rule keeps: a sent page, a page edited lately', async () => {
    const { db, docs } = fakeDb({ sent: draft({ mailingKey: 'm1' }), edited: draft({ changedAt: '2026-11-20T10:00:00.000Z' }) }, { sent: ['a'], edited: ['a'] });
    expect(await reapMailPageDrafts(db, NOW)).toBe(0);
    expect(docs.size).toBe(4);
  });

  it('keeps a draft that was continued between the query and the delete', async () => {
    const { db, docs, log } = fakeDb({ p1: draft(), p2: draft() }, { p1: ['a'], p2: ['a'] }, (live) => {
      live.set(page('p1'), { ...live.get(page('p1')), changedAt: '2026-11-26T02:59:00.000Z' });
    });
    expect(await reapMailPageDrafts(db, NOW)).toBe(1);
    expect(log).toEqual([page('p2'), section('p2', 'a')]);
    expect(docs.has(page('p1'))).toBe(true);
    expect(docs.has(section('p1', 'a'))).toBe(true);
  });

  it('keeps a draft that was sent between the query and the delete', async () => {
    const { db, docs, log } = fakeDb({ p1: draft() }, { p1: ['a'] }, (live) => {
      live.set(page('p1'), { ...live.get(page('p1')), mailingKey: 'm1' });
    });
    expect(await reapMailPageDrafts(db, NOW)).toBe(0);
    expect(log).toEqual([]);
    expect(docs.has(section('p1', 'a'))).toBe(true);
  });

  it('skips a page deleted meanwhile and goes on with the next', async () => {
    const { db, log } = fakeDb({ p1: draft(), p2: draft() }, { p2: ['a'] }, (live) => { live.delete(page('p1')); });
    expect(await reapMailPageDrafts(db, NOW)).toBe(1);
    expect(log).toEqual([page('p2'), section('p2', 'a')]);
  });
});
