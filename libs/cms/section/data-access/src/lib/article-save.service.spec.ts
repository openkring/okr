import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH, ENV, FIRESTORE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ColorIonic, IMAGE_STYLE_SHAPE, type ArticleSection, type SectionModel, type UserModel } from '@okr/shared-models';

import { ArticleBlocksGate } from './article-blocks-gate.service';
import { ArticleSaveService } from './article-save.service';
import { SectionService } from './section.service';

type Data = Record<string, unknown>;

/**
 * The server in memory. The real SectionService and FirestoreService run on it, so that the tests see what reaches Firestore,
 * and through which call: `writes` holds the committed writes of transactions, the other write methods are spies.
 */
const server = vi.hoisted(() => {
  type Write = { kind: 'set' | 'update'; path: string; data: Record<string, unknown> };
  const state = {
    docs: {} as Record<string, unknown>,          // an Error = cannot be read
    writes: [] as Write[],
    /** What the commits do in turn: fail with a code; run a change of somebody else first; or be applied, with the answer lost (`then` runs after it). */
    commits: [] as (string | (() => void) | { lost: true; then?: () => void })[],
    offline: false,
    reads: [] as string[],
    strictReads: [] as string[],
    /** A gate for the commits, to keep a save running. */
    hold: undefined as Promise<void> | undefined,
  };
  const fault = (code: string): Error => Object.assign(new Error(code), { code, name: 'FirebaseError' });
  const read = (path: string) => {
    const value = state.docs[path];
    if (state.offline) throw fault('unavailable');
    if (value instanceof Error) throw value;
    return { exists: () => value !== undefined && value !== null, data: () => structuredClone(value) };
  };
  const apply = (writes: Write[]): void => {
    for (const { kind, path, data } of writes) {
      const old = (state.docs[path] ?? {}) as Record<string, unknown>;
      if (kind === 'update' && !state.docs[path]) throw fault('not-found');
      const next = kind === 'set' ? {} : { ...old };
      for (const [key, value] of Object.entries(data)) {
        const removed = (value as { arrayRemove?: string } | undefined)?.arrayRemove;
        next[key] = removed === undefined ? value : (old[key] as string[]).filter((entry) => entry !== removed);
      }
      state.docs[path] = next;
      state.writes.push({ kind, path, data });
    }
  };
  const runTransaction = async (_db: unknown, body: (t: unknown) => Promise<void>): Promise<void> => {
    for (let attempt = 1; ; attempt++) {
      const writes: Write[] = [];
      const seen: Record<string, string> = {};
      try {
        await body({
          get: async (ref: { path: string }) => {
            state.reads.push(ref.path);
            const snapshot = read(ref.path);
            seen[ref.path] = JSON.stringify(state.docs[ref.path]);
            return snapshot;
          },
          set: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ kind: 'set', path: ref.path, data }),
          update: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ kind: 'update', path: ref.path, data }),
        });
        await state.hold;
        const commit = state.commits.shift();
        if (typeof commit === 'function') commit();
        // as the server: what was read must not have changed
        if (Object.entries(seen).some(([path, json]) => JSON.stringify(state.docs[path]) !== json)) throw fault('aborted');
        if (typeof commit === 'string') throw fault(commit);
        apply(writes);
        if (typeof commit === 'object') {
          commit.then?.();
          throw fault('unavailable');
        }
        return;
      } catch (ex) {
        const code = (ex as { code?: string }).code ?? '';
        if (attempt >= 5 || !['unavailable', 'aborted'].includes(code)) throw ex;
      }
    }
  };
  return { state, fault, read, runTransaction };
});

const other = vi.hoisted(() => ({ setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), writeBatch: vi.fn() }));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...other,
  doc: (parent: { path?: string }, path?: string) => ({ path: path ?? `${parent.path}/auto`, id: path?.split('/').pop() ?? 'auto' }),
  collection: (_db: unknown, path: string) => ({ path }),
  arrayRemove: (value: string) => ({ arrayRemove: value }),
  runTransaction: server.runTransaction,
  getDocFromServer: async (ref: { path: string }) => {
    server.state.strictReads.push(ref.path);
    return server.read(ref.path);
  },
}));
vi.mock('@sentry/angular', () => ({ captureMessage: vi.fn() }));
vi.mock('@okr/shared-config', async (importOriginal) => ({
  ...(await importOriginal<object>()), isFirestoreInitializedCheck: () => true, attestAppCheck: async () => 'refreshed',
}));

const tenantId = 'p13';
const user = { okey: 'u1', firstName: 'A', lastName: 'B' } as UserModel;
const A1 = 'sections/a1';
const FORK = `sections/a1_${tenantId}`;
const FORK_KEY = `a1_${tenantId}`;
const BLOCKS = [{ id: 'b1', type: 'text', html: '<p>neu</p>' }];

/** A section document as stored: no okey, no defaults. */
const stored = (overrides: Data = {}): Data => ({
  type: 'article', name: 'Artikel', title: 'Titel', tenants: [tenantId], isArchived: false,
  content: { htmlContent: '<p>alt</p>' }, properties: { images: [], blocks: [{ id: 'b1', type: 'text', html: '<p>alt</p>' }] }, ...overrides,
});
const loadedOf = (overrides: Data = {}): SectionModel => ({ ...stored(overrides), okey: 'a1' }) as unknown as SectionModel;
const edited = (overrides: Data = {}): ArticleSection =>
  ({ ...stored(), title: 'Neuer Titel', properties: { images: [], blocks: BLOCKS }, ...overrides, okey: overrides['okey'] ?? 'a1' }) as unknown as ArticleSection;
const docOf = (path: string): Data => server.state.docs[path] as Data;
/** A change by somebody else. */
const foreign = (path = A1) => { server.state.docs[path] = { ...docOf(path), title: 'Von jemand anderem' }; };

const SHARED = { tenants: ['scs', tenantId] };
const SYSTEM = { tenants: ['system'] };

const gate = { trial: false, mayWrite: () => mayWrite };
let mayWrite: boolean;
const toast = vi.fn();
let service: ArticleSaveService;

const configure = (providers: unknown[] = []) => {
  TestBed.configureTestingModule({
    providers: [
      ArticleSaveService, SectionService, FirestoreService,
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: ENV, useValue: { tenantId, services: {} } },
      { provide: FIRESTORE, useValue: {} },
      { provide: AUTH, useValue: { currentUser: { uid: 'u1' } } },
      { provide: ToastController, useValue: { create: toast } },
      { provide: I18nService, useValue: { translateAll: () => new Proxy({}, { get: (_target, key) => () => String(key) }) } },
      { provide: ArticleBlocksGate, useValue: gate },
      ...providers as [],
    ],
  });
  service = TestBed.inject(ArticleSaveService);
};
const toasts = () => toast.mock.calls.map(([options]) => options.message);

beforeEach(() => {
  Object.assign(server.state, { docs: {}, writes: [], commits: [], reads: [], strictReads: [], hold: undefined, offline: false });
  mayWrite = true;
  gate.trial = false;
  toast.mockReset().mockResolvedValue({ present: vi.fn() });
  for (const spy of Object.values(other)) spy.mockReset().mockResolvedValue(undefined);
  for (const level of ['debug', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('ArticleSaveService', () => {
  beforeEach(() => configure());
  afterEach(() => {
    // sections are written in transactions only: a queued write would be sent later, over newer work
    expect(other.updateDoc).not.toHaveBeenCalled();
    expect(other.writeBatch).not.toHaveBeenCalled();
    expect(other.deleteDoc).not.toHaveBeenCalled();
    for (const [ref] of other.setDoc.mock.calls) expect(ref.path).toBe('comments/auto');
  });

  const save = (options: { isNew?: boolean; force?: boolean; section?: ArticleSection; loaded?: SectionModel } = {}) =>
    service.save(options.section ?? edited(), options.loaded ?? loadedOf(), { isNew: options.isNew ?? false, force: options.force ?? false, currentUser: user });
  const expectNoWrite = () => expect(server.state.writes).toEqual([]);

  describe('a new article', () => {
    it('is created with its okey, toast and comment', async () => {
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(server.state.writes).toHaveLength(1);
      expect(docOf(A1)).toMatchObject({ title: 'Neuer Titel', tenants: [tenantId] });
      expect(docOf(A1)).not.toHaveProperty('okey');
      expect(toasts()).toEqual(['create_conf']);
      expect(other.setDoc).toHaveBeenCalledTimes(1);
    });

    it('fails when the okey is taken by somebody else, also with force', async () => {
      server.state.docs[A1] = stored();
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'failed' });
      await expect(save({ isNew: true, force: true })).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
      expect(toasts()).toEqual(['create_error', 'create_error']);
    });

    it('fails when the commit is denied', async () => {
      server.state.commits = ['permission-denied', 'permission-denied'];
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'failed' });
      expect(toasts()).toEqual(['create_error']);
    });

    it('is offline when the server cannot be read', async () => {
      server.state.docs[A1] = server.fault('unavailable');
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'offline' });
    });

    it('fails without an okey', async () => {
      await expect(save({ isNew: true, section: { ...edited(), okey: '' } })).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('is saved when the answer of the commit was lost', async () => {
      server.state.commits = [{ lost: true }];
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(server.state.writes).toHaveLength(1);
      expect(server.state.strictReads).toEqual([A1]);
    });

    it('is saved when the comment fails', async () => {
      other.setDoc.mockRejectedValue(server.fault('permission-denied'));
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
    });

    describe('saved again', () => {
      it('is updated when nobody changed it', async () => {
        await save({ isNew: true });
        await expect(save({ isNew: true, section: edited({ title: 'Zweiter' }) })).resolves.toEqual({ status: 'saved', key: 'a1' });
        expect(docOf(A1)['title']).toBe('Zweiter');
        expect(server.state.writes.map((w) => w.kind)).toEqual(['set', 'update']);
        await expect(save({ isNew: true, section: edited({ title: 'Dritter' }) })).resolves.toMatchObject({ status: 'saved' });
      });

      it('is a conflict when somebody changed it, and overwrites it with force', async () => {
        await save({ isNew: true });
        foreign();
        await expect(save({ isNew: true, section: edited({ title: 'Zweiter' }) })).resolves.toEqual({ status: 'conflict' });
        expect(docOf(A1)['title']).toBe('Von jemand anderem');
        await expect(save({ isNew: true, force: true, section: edited({ title: 'Zweiter' }) })).resolves.toMatchObject({ status: 'saved' });
      });

      it('is gone when somebody archived it', async () => {
        await save({ isNew: true });
        docOf(A1)['isArchived'] = true;
        await expect(save({ isNew: true })).resolves.toEqual({ status: 'gone' });
      });

      it('is updated after a save whose result was never known', async () => {
        // applied, the answer lost, then no network at all
        server.state.commits = [{ lost: true, then: () => { server.state.offline = true; } }];
        await expect(save({ isNew: true })).resolves.toEqual({ status: 'offline' });
        server.state.offline = false;
        await expect(save({ isNew: true, section: edited({ title: 'Zweiter' }) })).resolves.toMatchObject({ status: 'saved' });
        expect(docOf(A1)['title']).toBe('Zweiter');
      });

      it('is updated after a second save that did not reach the server', async () => {
        await save({ isNew: true });
        server.state.commits = Array.from({ length: 5 }, () => 'unavailable');
        await expect(save({ isNew: true, section: edited({ title: 'Zweiter' }) })).resolves.toEqual({ status: 'failed' });
        await expect(save({ isNew: true, section: edited({ title: 'Zweiter' }) })).resolves.toMatchObject({ status: 'saved' });
      });

      it('is created when the first save did not reach the server', async () => {
        server.state.commits = Array.from({ length: 5 }, () => 'unavailable');
        await expect(save({ isNew: true })).resolves.toEqual({ status: 'failed' });
        await expect(save({ isNew: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
        expect(server.state.writes.map((w) => w.kind)).toEqual(['set']);
      });
    });
  });

  describe('an own article', () => {
    beforeEach(() => { server.state.docs[A1] = stored(); });

    it('is updated when nothing changed meanwhile, with toast and comment', async () => {
      await expect(save()).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(server.state.writes).toMatchObject([{ kind: 'update', path: A1, data: { title: 'Neuer Titel', tenants: [tenantId] } }]);
      expect(server.state.reads).toEqual([A1]);
      expect(server.state.strictReads).toEqual([]);
      expect(toasts()).toEqual(['update_conf']);
      expect(other.setDoc).toHaveBeenCalledTimes(1);
    });

    it('is not changed by a difference that only comes from loading', async () => {
      server.state.docs[A1] = stored({ notes: '', tags: [] });
      await expect(save({ loaded: loadedOf({ subTitle: undefined, notes: null }) })).resolves.toMatchObject({ status: 'saved' });
    });

    it('is a conflict when it changed meanwhile, and is updated with force', async () => {
      foreign();
      await expect(save()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
      expect(toasts()).toEqual([]);
      await expect(save({ force: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(docOf(A1)['title']).toBe('Neuer Titel');
    });

    it('is a conflict when it changes between the read and the write', async () => {
      server.state.commits = [() => foreign()];
      await expect(save()).resolves.toEqual({ status: 'conflict' });
      expect(docOf(A1)['title']).toBe('Von jemand anderem');
    });

    it('compares the document as stored, without classic fields or defaults', async () => {
      const properties = { blocks: [{ id: 'b1', type: 'text', html: '<p>blocks</p>' }] };
      const loaded = loadedOf({ content: { htmlContent: '' }, properties });
      server.state.docs[A1] = stored({ content: { htmlContent: '<p>blocks</p>' }, properties: { ...properties, images: [] } });
      await expect(save({ loaded })).resolves.toEqual({ status: 'conflict' });
      server.state.docs[A1] = stored({ content: { htmlContent: '' }, properties });
      await expect(save({ loaded })).resolves.toMatchObject({ status: 'saved' });
    });

    it('fails when the commit is denied', async () => {
      server.state.commits = ['permission-denied', 'permission-denied'];
      await expect(save()).resolves.toEqual({ status: 'failed' });
      expect(toasts()).toEqual(['update_error']);
    });

    it('is offline when it cannot be read, also with force', async () => {
      for (const code of ['unavailable', 'permission-denied']) {
        server.state.docs[A1] = server.fault(code);
        await expect(save()).resolves.toEqual({ status: 'offline' });
        await expect(save({ force: true })).resolves.toEqual({ status: 'offline' });
      }
      expectNoWrite();
      expect(toasts()).toEqual([]);
    });

    it('is saved when the answer of the commit was lost: its own change is no conflict', async () => {
      server.state.commits = [{ lost: true }];
      await expect(save()).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(server.state.writes).toHaveLength(1);
      expect(toasts()).toEqual(['update_conf']);
    });

    it('is a conflict when the answer was lost and somebody changed it since', async () => {
      server.state.commits = [{ lost: true, then: () => foreign() }];
      await expect(save()).resolves.toEqual({ status: 'conflict' });
      expect(docOf(A1)['title']).toBe('Von jemand anderem');
    });

    it('is gone when the answer was lost and the article was taken from the tenant since', async () => {
      server.state.commits = [{ lost: true, then: () => { docOf(A1)['tenants'] = ['scs']; } }];
      await expect(save()).resolves.toEqual({ status: 'gone' });
    });

    it('is offline when the answer was lost and nothing can be read any more', async () => {
      server.state.commits = [{ lost: true, then: () => { server.state.offline = true; } }];
      await expect(save()).resolves.toEqual({ status: 'offline' });
    });

    it('is saved when the comment is refused or never answered', async () => {
      other.setDoc.mockRejectedValueOnce(server.fault('permission-denied'));
      await expect(save()).resolves.toMatchObject({ status: 'saved' });
      other.setDoc.mockReturnValue(new Promise(() => undefined));
      await expect(save({ force: true })).resolves.toMatchObject({ status: 'saved' });
    });

    it('fails on data that cannot be stored', async () => {
      await expect(save({ section: edited({ notes: () => 1 }) })).resolves.toEqual({ status: 'failed' });
      await expect(service.save(undefined as never, loadedOf(), { isNew: false, force: false })).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('is decided by the tenants of the server, not by those at opening', async () => {
      // it got a second tenant meanwhile: a fork, never `tenants: [own]` on the shared document
      server.state.docs[A1] = stored(SHARED);
      await expect(save()).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(docOf(A1)).toEqual(stored({ tenants: ['scs'] }));
      expect(docOf(FORK)).toMatchObject({ title: 'Neuer Titel', tenants: [tenantId] });
    });

    it('does not bring a detached tenant back', async () => {
      await expect(save({ section: edited(SHARED), loaded: loadedOf(SHARED) })).resolves.toMatchObject({ status: 'saved', key: 'a1' });
      expect(docOf(A1)['tenants']).toEqual([tenantId]);
    });

    it('does not change the section it was given', async () => {
      const section = Object.freeze(edited(SHARED));
      await save({ section });
      expect(section.tenants).toEqual(SHARED.tenants);
    });

    it('clears what the article does not have any more', async () => {
      const theirs = { intro: 'Einleitung', introPosition: 'above', notes: 'Notiz', tags: 'a,b', subTitle: 'Untertitel' };
      server.state.docs[A1] = stored({ ...theirs, color: 'danger', order: 'x' });
      await save({ section: edited({ subTitle: undefined }), force: true });
      expect(docOf(A1)).toMatchObject({ intro: '', introPosition: 'below', notes: '', tags: '', subTitle: '', color: ColorIonic.Primary, order: 'x' });
    });

    it('adds no default that neither side has', async () => {
      await save();
      expect(Object.keys(docOf(A1)).sort()).toEqual([...Object.keys(stored()), 'index'].sort());
    });

    it('replaces properties and content as a whole', async () => {
      server.state.docs[A1] = stored({ properties: { images: [], blocks: [], cover: { url: 'x' } }, content: { htmlContent: 'x', colSize: 4 } });
      await save({ force: true });
      expect(docOf(A1)['properties']).toEqual({ images: [], blocks: BLOCKS });
      expect(docOf(A1)['content']).toEqual({ htmlContent: '<p>alt</p>' });
    });
  });

  describe.each([
    ['gone', undefined],
    ['archived', stored({ isArchived: true })],
    ['without the tenant', stored({ tenants: ['scs'] })],
    ['without tenants', stored({ tenants: undefined })],
    ['with malformed tenants', stored({ tenants: tenantId })],
  ])('an article that is %s', (_label, document) => {
    beforeEach(() => { server.state.docs[A1] = structuredClone(document); });

    it('is gone without a fork, also with force', async () => {
      await expect(save()).resolves.toEqual({ status: 'gone' });
      await expect(save({ force: true })).resolves.toEqual({ status: 'gone' });
      expect(server.state.reads).toContain(FORK);
      expectNoWrite();
    });

    it('is gone with an archived fork', async () => {
      server.state.docs[FORK] = stored({ isArchived: true });
      await expect(save({ force: true })).resolves.toEqual({ status: 'gone' });
      expectNoWrite();
    });

    it('is a conflict with a fork, and updates the fork with force', async () => {
      server.state.docs[FORK] = stored({ notes: 'Notiz' });
      await expect(save({ section: edited(SHARED), loaded: loadedOf(SHARED) })).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
      await expect(save({ force: true, section: edited(SHARED), loaded: loadedOf(SHARED) })).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(docOf(FORK)).toMatchObject({ tenants: [tenantId], title: 'Neuer Titel', notes: '' });
      expect(docOf(FORK)).not.toHaveProperty('okey');
      expect(docOf(A1)).toEqual(document);
    });

    it('is offline when the fork cannot be read', async () => {
      server.state.docs[FORK] = server.fault('permission-denied');
      await expect(save({ force: true })).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });
  });

  describe.each([['shared', SHARED], ['system', SYSTEM]])('a %s article', (_label, tenants) => {
    const rest = tenants.tenants.filter((tenant) => tenant !== tenantId);
    const saveShared = (force = false) => save({ section: edited(tenants), loaded: loadedOf(tenants), force });
    beforeEach(() => { server.state.docs[A1] = stored(tenants); });

    it('is forked when there is no fork and nothing changed: copy and detach in one transaction', async () => {
      await expect(saveShared()).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(server.state.writes.map(({ kind, path }) => [kind, path])).toEqual([['set', FORK], ['update', A1]]);
      expect(docOf(FORK)).toMatchObject({ title: 'Neuer Titel', tenants: [tenantId] });
      expect(docOf(A1)).toEqual(stored({ tenants: rest }));
      expect(server.state.reads).toEqual([A1, FORK]);
      expect(toasts()).toEqual([]);
      expect(other.setDoc).not.toHaveBeenCalled();
    });

    it('replaces an archived fork', async () => {
      server.state.docs[FORK] = stored({ isArchived: true, order: 'x' });
      await expect(saveShared()).resolves.toMatchObject({ status: 'saved', key: FORK_KEY });
      expect(docOf(FORK)).toMatchObject({ isArchived: false });
      expect(docOf(FORK)).not.toHaveProperty('order');
    });

    it('is a conflict when the original changed, and is forked with force', async () => {
      foreign();
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
      await expect(saveShared(true)).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(docOf(A1)['title']).toBe('Von jemand anderem');
    });

    it('is a conflict when a fork appeared, even one with the same content, and updates it with force', async () => {
      server.state.docs[FORK] = stored();
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
      await expect(saveShared(true)).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(server.state.writes.map(({ kind, path }) => [kind, path])).toEqual([['update', FORK]]);
    });

    it('is a conflict when the fork appears between the read and the write', async () => {
      server.state.commits = [() => { server.state.docs[FORK] = stored({ title: 'Von jemand anderem' }); }];
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      expect(docOf(FORK)['title']).toBe('Von jemand anderem');
    });

    it('is saved when the answer of the fork was lost', async () => {
      server.state.commits = [{ lost: true }];
      await expect(saveShared()).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(server.state.strictReads).toEqual([FORK]);
    });

    it.each([[['scs']], [['scs', tenantId]], [['system']], [undefined]])('never writes over a fork document with tenants %j', async (forkTenants) => {
      server.state.docs[FORK] = stored({ tenants: forkTenants });
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      await expect(saveShared(true)).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('never writes over an archived fork document of others', async () => {
      server.state.docs[FORK] = stored({ tenants: ['scs'], isArchived: true });
      await expect(saveShared(true)).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('fails when the fork is denied', async () => {
      server.state.commits = ['permission-denied', 'permission-denied'];
      await expect(saveShared()).resolves.toEqual({ status: 'failed' });
      expect(toasts()).toEqual(['update_error']);
      expectNoWrite();
    });

    it('is offline when the fork or the original cannot be read', async () => {
      server.state.docs[FORK] = server.fault('unavailable');
      await expect(saveShared(true)).resolves.toEqual({ status: 'offline' });
      server.state.docs[A1] = server.fault('unavailable');
      await expect(saveShared(true)).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });
  });

  describe('the gate', () => {
    const classic = { properties: { images: [] } };
    beforeEach(() => { mayWrite = false; });

    it('closed: no new article with blocks, and no first blocks', async () => {
      server.state.docs['sections/a2'] = stored(classic);
      await expect(save({ isNew: true, loaded: loadedOf(), force: true })).resolves.toEqual({ status: 'failed' });
      await expect(save({ section: edited({ okey: 'a2' }), loaded: loadedOf(classic), force: true })).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('closed: an article that has blocks stays saveable, and so does one without', async () => {
      server.state.docs[A1] = stored();
      await expect(save()).resolves.toMatchObject({ status: 'saved' });
      server.state.docs[A1] = stored(classic);
      await expect(save({ section: edited(classic), loaded: loadedOf(classic) })).resolves.toMatchObject({ status: 'saved' });
      await expect(save({ section: edited({ ...classic, okey: 'a3' }), isNew: true })).resolves.toMatchObject({ status: 'saved' });
    });

    it('open: blocks may be introduced', async () => {
      mayWrite = true;
      server.state.docs[A1] = stored(classic);
      await expect(save({ loaded: loadedOf(classic) })).resolves.toMatchObject({ status: 'saved' });
    });
  });

  describe('two calls at once', () => {
    beforeEach(() => { server.state.docs[A1] = stored(); });

    it('with the same section and options write once and return one result', async () => {
      const section = edited();
      const [first, second] = await Promise.all([save({ section }), save({ section })]);
      expect(first).toEqual({ status: 'saved', key: 'a1' });
      expect(second).toEqual(first);
      expect(server.state.writes).toHaveLength(1);
      expect(server.state.reads).toHaveLength(1);
    });

    it('with other content: the second is never reported as saved without being written', async () => {
      const [first, second] = await Promise.all([save(), save({ section: edited({ title: 'Zweiter' }) })]);
      expect(first).toEqual({ status: 'saved', key: 'a1' });
      expect(second).toEqual({ status: 'conflict' });      // its `loaded` is older than the first save
      expect(docOf(A1)['title']).toBe('Neuer Titel');
    });

    it('with other content and force: both are written, in turn', async () => {
      const [first, second] = await Promise.all([save(), save({ section: edited({ title: 'Zweiter' }), force: true })]);
      expect([first, second]).toEqual([{ status: 'saved', key: 'a1' }, { status: 'saved', key: 'a1' }]);
      expect(server.state.writes.map((w) => w.data['title'])).toEqual(['Neuer Titel', 'Zweiter']);
    });

    it('with the same section and other options: the second runs itself', async () => {
      foreign();
      const section = edited();
      await expect(Promise.all([save({ section }), save({ section, force: true })])).resolves.toEqual([{ status: 'conflict' }, { status: 'saved', key: 'a1' }]);
    });

    it('a second call never overwrites a change that came after the first save', async () => {
      let release: () => void = () => undefined;
      server.state.hold = new Promise((resolve) => { release = resolve; });
      const first = save();
      const second = save({ section: edited({ title: 'Zweiter' }) });
      void first.then(() => foreign());
      release();
      await expect(first).resolves.toMatchObject({ status: 'saved' });
      await expect(second).resolves.toEqual({ status: 'conflict' });
    });

    it('a third call waits for the second, and shares it when it is the same', async () => {
      const second = edited({ title: 'Zweiter' });
      const results = await Promise.all([save(), save({ section: second, force: true }), save({ section: second, force: true })]);
      expect(results.map((r) => r.status)).toEqual(['saved', 'saved', 'saved']);
      expect(server.state.writes.map((w) => w.data['title'])).toEqual(['Neuer Titel', 'Zweiter']);
    });

    it('of a new article: both contents are written, in turn', async () => {
      server.state.docs = {};
      const results = await Promise.all([save({ isNew: true }), save({ isNew: true, section: edited({ title: 'Zweiter' }) })]);
      expect(results).toEqual([{ status: 'saved', key: 'a1' }, { status: 'saved', key: 'a1' }]);
      expect(docOf(A1)['title']).toBe('Zweiter');
    });

    it('the second runs after a failed first', async () => {
      server.state.commits = ['permission-denied', 'permission-denied'];
      const results = await Promise.all([save(), save({ section: edited({ title: 'Zweiter' }) })]);
      expect(results).toEqual([{ status: 'failed' }, { status: 'saved', key: 'a1' }]);
    });

    it('the next call after a result starts again, also with the same section', async () => {
      const section = edited();
      server.state.docs[A1] = server.fault('unavailable');
      await expect(save({ section })).resolves.toEqual({ status: 'offline' });
      server.state.docs[A1] = stored();
      await expect(save({ section })).resolves.toMatchObject({ status: 'saved' });
    });

    it('of two different articles do not wait for each other', async () => {
      server.state.docs['sections/a2'] = stored();
      const results = await Promise.all([save(), save({ section: edited({ okey: 'a2' }) })]);
      expect(results).toEqual([{ status: 'saved', key: 'a1' }, { status: 'saved', key: 'a2' }]);
    });
  });
});

describe('what is written equals SectionService', () => {
  beforeEach(() => configure());
  const section = edited({ subTitle: 'Unter', notes: undefined, properties: { images: [], blocks: BLOCKS, imageStyle: { ...IMAGE_STYLE_SHAPE, width: '161' } } });
  const options = { isNew: false, force: false };

  it('update', async () => {
    server.state.docs[A1] = stored();
    await service.save(section, loadedOf(), options);
    await TestBed.inject(SectionService).update(section);
    expect(server.state.writes[0].data).toEqual(other.updateDoc.mock.calls[0][1]);
  });

  it('update of an article without blocks: the image style is compacted', async () => {
    const properties = { images: [], imageStyle: { ...IMAGE_STYLE_SHAPE, width: '161' } };
    server.state.docs[A1] = stored({ properties });
    await service.save(edited({ properties }), loadedOf({ properties }), options);
    await TestBed.inject(SectionService).update(edited({ properties }));
    expect(server.state.writes[0].data['properties']).toEqual({ images: [], imageStyle: { width: '161' } });
    expect(server.state.writes[0].data).toEqual(other.updateDoc.mock.calls[0][1]);
  });

  it('create', async () => {
    await service.save(section, loadedOf(), { ...options, isNew: true });
    await TestBed.inject(SectionService).create({ ...section, okey: '' });
    // create() leaves undefined values to Firestore, which drops them
    expect(server.state.writes[0].data).toEqual(JSON.parse(JSON.stringify(other.setDoc.mock.calls[0][1])));
  });

  it('fork', async () => {
    server.state.docs[A1] = stored(SHARED);
    const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    other.writeBatch.mockReturnValue(batch);
    await service.save({ ...section, ...SHARED }, loadedOf(SHARED), options);
    await TestBed.inject(SectionService).update({ ...section, ...SHARED });
    expect(server.state.writes.map(({ path, data }) => [path, data])).toEqual([
      [batch.set.mock.calls[0][0].path, batch.set.mock.calls[0][1]], [batch.update.mock.calls[0][0].path, batch.update.mock.calls[0][1]],
    ]);
  });
});

describe('ArticleSaveService in trial mode', () => {
  it.each([[true, false], [true, true], [false, false], [false, true]])('writes and reads nothing (isNew %s, force %s)', async (isNew, force) => {
    // every method of the gateway is a spy, and SectionService is the real one: a write through any helper would show
    const names = Object.getOwnPropertyNames(FirestoreService.prototype).filter((name) => name !== 'constructor');
    expect(names).toEqual(expect.arrayContaining(['createModel', 'updateModel', 'forkModel', 'writeChecked', 'getBatch', 'commitBatch', 'saveComment']));
    const firestore = Object.fromEntries(names.map((name) => [name, vi.fn()]));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    gate.trial = true;
    configure([{ provide: FirestoreService, useValue: firestore }]);
    const sections = TestBed.inject(SectionService);
    const calls = [vi.spyOn(sections, 'create'), vi.spyOn(sections, 'update'), vi.spyOn(sections, 'saveChecked')];
    const section = edited();

    await expect(service.save(section, loadedOf(), { isNew, force, currentUser: user })).resolves.toEqual({ status: 'saved', key: 'a1', trial: true });

    for (const call of calls) expect(call).not.toHaveBeenCalled();
    for (const name of names) expect(firestore[name], name).not.toHaveBeenCalled();
    for (const spy of Object.values(other)) expect(spy).not.toHaveBeenCalled();
    expect(server.state.writes).toEqual([]);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]).toContain(section);
  });
});
