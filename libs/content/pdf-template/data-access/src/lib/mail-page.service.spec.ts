import { Injector } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Firestore in memory: documents by path, the writes of each committed batch, and the reads. A commit may be refused with a code
 * (`refuse`), as the rules would.
 */
const db = vi.hoisted(() => {
  type Ref = { path: string; id: string; kind: 'doc' } | { path: string; kind: 'col' };
  const state = {
    docs: {} as Record<string, Record<string, unknown>>,
    commits: [] as { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> }[][],
    reads: [] as string[],
    refuse: undefined as string | undefined,
    refuseRead: undefined as string | undefined,
    next: 0,
  };
  const fault = (code: string) => Object.assign(new Error(code), { code });
  const join = (base: unknown, segments: string[]) => [typeof base === 'object' && base && 'path' in base ? (base as Ref).path : '', ...segments].filter(Boolean).join('/');
  const snapshot = (path: string) => ({
    id: path.split('/').pop() as string, ref: { path, id: path.split('/').pop() as string, kind: 'doc' as const },
    exists: () => !!state.docs[path], data: () => (state.docs[path] ? structuredClone(state.docs[path]) : undefined),
  });
  const DELETE = { __delete: true };
  return {
    state,
    DELETE,
    collection: (base: unknown, ...segments: string[]): Ref => ({ path: join(base, segments), kind: 'col' }),
    doc: (base: unknown, ...segments: string[]): Ref => {
      const path = segments.length ? join(base, segments) : `${join(base, [])}/auto${++state.next}`;
      return { path, id: path.split('/').pop() as string, kind: 'doc' };
    },
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    query: (col: Ref, ...wheres: { field: string; value: unknown }[]) => ({ ...col, wheres }),
    deleteField: () => DELETE,
    getDoc: async (ref: Ref) => {
      state.reads.push(ref.path);
      if (state.refuseRead) throw fault(state.refuseRead);
      return snapshot(ref.path);
    },
    getDocs: async (q: Ref & { wheres?: { field: string; value: unknown }[] }) => {
      state.reads.push(q.path);
      if (state.refuseRead) throw fault(state.refuseRead);
      const depth = q.path.split('/').length + 1;
      const docs = Object.keys(state.docs)
        .filter((path) => path.startsWith(`${q.path}/`) && path.split('/').length === depth)
        .filter((path) => (q.wheres ?? []).every((w) => state.docs[path][w.field] === w.value))
        .sort()
        .map(snapshot);
      return { docs, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
    },
    writeBatch: () => {
      const ops: { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> }[] = [];
      return {
        set: (ref: Ref, data: Record<string, unknown>) => ops.push({ op: 'set', path: ref.path, data }),
        update: (ref: Ref, data: Record<string, unknown>) => ops.push({ op: 'update', path: ref.path, data }),
        delete: (ref: Ref) => ops.push({ op: 'delete', path: ref.path }),
        commit: async () => {
          if (state.refuse) throw fault(state.refuse);
          for (const { op, path, data } of ops) {
            if (op === 'delete') delete state.docs[path];
            else if (op === 'set') state.docs[path] = structuredClone(data as Record<string, unknown>);
            else {
              if (!state.docs[path]) throw fault('not-found');
              const next = { ...state.docs[path] };
              for (const [key, value] of Object.entries(data ?? {})) {
                if (value === DELETE) delete next[key];
                else next[key] = structuredClone(value);
              }
              state.docs[path] = next;
            }
          }
          state.commits.push(ops);
        },
      };
    },
  };
});

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn(), arrayUnion: vi.fn(), updateDoc: vi.fn(),
  collection: db.collection, doc: db.doc, where: db.where, query: db.query, deleteField: db.deleteField,
  getDoc: db.getDoc, getDocs: db.getDocs, writeBatch: db.writeBatch,
}));
vi.mock('rxfire/firestore', () => ({ docData: vi.fn(), collectionData: vi.fn() }));

import { FIRESTORE } from '@okr/shared-config';
import type { MailBlock, MailPageModel } from '@okr/shared-models';

import { MailPageService } from './mail-page.service';

const META = { subject: 'Neu', layout: 'standard' as const, webVersion: false };
const CTX = { tenantId: 'scs', uid: 'u1' };
const text = (id: string, html: string): MailBlock => ({ id, type: 'text', html });

function service(): MailPageService {
  return Injector.create({ providers: [{ provide: FIRESTORE, useValue: {} }, { provide: MailPageService }] }).get(MailPageService);
}

function put(path: string, data: Record<string, unknown>): void {
  db.state.docs[path] = structuredClone(data);
}

/** An own draft of 1.176: the page and its one article. */
function blockDraft(key: string, blocks: MailBlock[], page: Partial<MailPageModel> = {}): void {
  put(`mailPages/${key}`, { tenants: ['scs'], senderUid: 'u1', createdAt: '2026-11-20T10:00:00.000Z', sections: ['a1'], subject: 'Einladung', layout: 'plain', webVersion: true, ...page });
  put(`mailPages/${key}/sections/a1`, { type: 'article', tenants: ['scs'], properties: { blocks } });
}

/** A draft of 1.172: an article with text, a button section and events, in this order. */
function sectionsDraft(key: string): void {
  put(`mailPages/${key}`, { tenants: ['scs'], senderUid: 'u1', createdAt: '2026-11-01T10:00:00.000Z', sections: ['s2', 's1', 's3'], groupKey: 'g-old' });
  put(`mailPages/${key}/sections/s1`, { type: 'button', tenants: ['scs'], properties: { style: { label: 'Anmelden' }, action: { url: '/club' } } });
  put(`mailPages/${key}/sections/s2`, { type: 'article', tenants: ['scs'], content: { htmlContent: '<p>Hallo</p>' }, properties: {} });
  put(`mailPages/${key}/sections/s3`, { type: 'events', tenants: ['scs'], name: 'scs', properties: { maxEvents: 3 } });
}

describe('MailPageService', () => {
  beforeEach(() => {
    db.state.docs = {};
    db.state.commits = [];
    db.state.reads = [];
    db.state.refuse = undefined;
    db.state.refuseRead = undefined;
    db.state.next = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('ownPages', () => {
    it('asks for the caller’s pages and keeps those of the tenant, drafts and sent ones', async () => {
      put('mailPages/d1', { tenants: ['scs'], senderUid: 'u1' });
      put('mailPages/s1', { tenants: ['scs'], senderUid: 'u1', mailingKey: 'm1' });
      put('mailPages/p13', { tenants: ['p13'], senderUid: 'u1' });
      put('mailPages/other', { tenants: ['scs'], senderUid: 'u2' });
      const pages = await service().ownPages('u1', 'scs');
      expect(pages.map((p) => p.okey).sort()).toEqual(['d1', 's1']);
      expect(await service().ownPages('', 'scs')).toEqual([]);
    });
  });

  describe('loadBlocks', () => {
    it('copies the blocks of an article with new ids', async () => {
      const columns = { id: 'c', type: 'columns', columns: [{ blocks: [text('t2', '<p>innen</p>')] }, { blocks: [] }] } as unknown as MailBlock;
      blockDraft('p1', [text('t1', '<p>Hi</p>'), columns]);
      const blocks = await service().loadBlocks('p1', ['a1']);
      expect(blocks.map((b) => b.type)).toEqual(['text', 'columns']);
      expect(blocks[0].id).not.toBe('t1');
      const inner = (blocks[1] as unknown as { columns: { blocks: MailBlock[] }[] }).columns[0].blocks[0];
      expect(inner.id).not.toBe('t2');
      expect(db.state.commits).toEqual([]);
    });

    it('converts the sections of 1.172 in the order of the page, reading the page when the order is not given', async () => {
      sectionsDraft('p1');
      const blocks = await service().loadBlocks('p1');
      expect(blocks.map((b) => b.type)).toEqual(['text', 'button', 'events']);
      expect(db.state.reads[0]).toBe('mailPages/p1');
    });
  });

  describe('continueDraft', () => {
    it('a draft of 1.176 keeps its article and blocks; groupKey becomes the current one, in one write', async () => {
      blockDraft('p1', [text('t1', '<p>Hi</p>')]);
      const result = await service().continueDraft('p1', { ...CTX, groupKey: 'g1' });
      expect(result).toEqual({ status: 'ok', pageKey: 'p1', articleKey: 'a1', blocks: [text('t1', '<p>Hi</p>')], meta: { subject: 'Einladung', layout: 'plain', webVersion: true } });
      expect(db.state.commits).toHaveLength(1);
      expect(db.state.commits[0].map((w) => [w.op, w.path])).toEqual([['update', 'mailPages/p1']]);
      expect(db.state.docs['mailPages/p1']['groupKey']).toBe('g1');
      expect(typeof db.state.docs['mailPages/p1']['changedAt']).toBe('string');
    });

    it('without a group in the composer the page loses its groupKey', async () => {
      blockDraft('p1', [text('t1', '<p>Hi</p>')], { groupKey: 'g1' });
      await service().continueDraft('p1', CTX);
      expect(db.state.docs['mailPages/p1']).not.toHaveProperty('groupKey');
    });

    it('a draft of 1.172 has its sections replaced by one article of blocks, in one batch', async () => {
      sectionsDraft('p1');
      const result = await service().continueDraft('p1', { ...CTX, groupKey: 'g1' });
      if (result.status !== 'ok') throw new Error(result.status);
      expect(result.blocks.map((b) => b.type)).toEqual(['text', 'button', 'events']);
      expect(db.state.commits).toHaveLength(1);
      const sections = Object.keys(db.state.docs).filter((path) => path.startsWith('mailPages/p1/sections/'));
      expect(sections).toEqual([`mailPages/p1/sections/${result.articleKey}`]);
      const article = db.state.docs[sections[0]];
      expect(article['type']).toBe('article');
      expect(article).not.toHaveProperty('content');
      expect((article['properties'] as { blocks: MailBlock[] }).blocks).toEqual(result.blocks);
      expect(db.state.docs['mailPages/p1']['sections']).toEqual([result.articleKey]);
      expect(db.state.docs['mailPages/p1']['groupKey']).toBe('g1');
      expect(result.meta).toEqual({});
    });

    it('a draft sent or deleted meanwhile is not written', async () => {
      blockDraft('p1', [text('t1', '<p>Hi</p>')], { mailingKey: 'm1' });
      expect(await service().continueDraft('p1', CTX)).toEqual({ status: 'sent' });
      expect(await service().continueDraft('gone', CTX)).toEqual({ status: 'gone' });
      blockDraft('p2', [text('t1', '<p>Hi</p>')], { senderUid: 'u2' });
      expect(await service().continueDraft('p2', CTX)).toEqual({ status: 'gone' });
      blockDraft('p3', [text('t1', '<p>Hi</p>')], { tenants: ['p13'] });
      expect(await service().continueDraft('p3', CTX)).toEqual({ status: 'gone' });
      expect(db.state.commits).toEqual([]);
    });

    it('a refused write (role or group lost) leaves the draft as it was', async () => {
      sectionsDraft('p1');
      const before = structuredClone(db.state.docs);
      db.state.refuse = 'permission-denied';
      expect(await service().continueDraft('p1', { ...CTX, groupKey: 'g1' })).toEqual({ status: 'refused' });
      expect(db.state.docs).toEqual(before);
      db.state.refuse = 'unavailable';
      expect(await service().continueDraft('p1', CTX)).toEqual({ status: 'failed' });
      db.state.refuse = undefined;
      db.state.refuseRead = 'unavailable';
      expect(await service().continueDraft('p1', CTX)).toEqual({ status: 'failed' });
    });
  });

  describe('startFrom', () => {
    it('copies an earlier mail into a new page: new ids, subject, template, web version; nothing of the source is written', async () => {
      blockDraft('src', [text('t1', '<p>Hi</p>')], { mailingKey: 'm1' });
      const before = structuredClone(db.state.docs);
      const started = await service().startFrom('src', { ...CTX, groupKey: 'g1' }, META);
      expect(started.pageKey).not.toBe('src');
      expect(started.meta).toEqual({ subject: 'Einladung', layout: 'plain', webVersion: true });
      expect(started.blocks).toHaveLength(1);
      expect(started.blocks[0]).toEqual({ ...text('t1', '<p>Hi</p>'), id: started.blocks[0].id });
      expect(started.blocks[0].id).not.toBe('t1');
      expect(db.state.commits).toHaveLength(1);
      expect(db.state.commits[0].every((w) => w.op === 'set' && w.path.startsWith(`mailPages/${started.pageKey}`))).toBe(true);
      for (const [path, data] of Object.entries(before)) expect(db.state.docs[path]).toEqual(data);
      const page = db.state.docs[`mailPages/${started.pageKey}`];
      expect(page).toMatchObject({ subject: 'Einladung', layout: 'plain', webVersion: true, senderUid: 'u1', tenants: ['scs'], groupKey: 'g1', sections: [started.articleKey] });
      expect(page).not.toHaveProperty('mailingKey');
      // the copy shares no object with the source
      (started.blocks[0] as { html: string }).html = '<p>geändert</p>';
      expect(((db.state.docs['mailPages/src/sections/a1']['properties'] as { blocks: MailBlock[] }).blocks[0] as { html: string }).html).toBe('<p>Hi</p>');
    });

    it('a page without a subject takes the fallback (the mailing’s); a missing one throws', async () => {
      blockDraft('src', [text('t1', '<p>Hi</p>')], { mailingKey: 'm1', subject: undefined, webVersion: undefined, layout: undefined });
      delete db.state.docs['mailPages/src']['subject'];
      const started = await service().startFrom('src', CTX, { ...META, subject: 'Vom Versand', webVersion: true });
      expect(started.meta).toEqual({ subject: 'Vom Versand', layout: 'standard', webVersion: true });
      await expect(service().startFrom('missing', CTX, META)).rejects.toMatchObject({ code: 'not-found' });
    });

    it('without a source: a new page with one empty text', async () => {
      const started = await service().startFrom(undefined, CTX, META);
      expect(started.blocks).toEqual([{ id: started.blocks[0].id, type: 'text', html: '' }]);
      expect(started.meta).toEqual(META);
    });
  });
});
