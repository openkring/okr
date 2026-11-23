import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import type { ArticleSection, SectionModel, UserModel } from '@okr/shared-models';

import { ArticleBlocksGate } from './article-blocks-gate.service';
import { ArticleSaveService } from './article-save.service';
import { SectionService } from './section.service';

const tenantId = 'p13';
const user = { okey: 'u1' } as UserModel;

/** A section document as stored: no okey, no defaults. */
const stored = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'article', name: 'Artikel', title: 'Titel', tenants: [tenantId], isArchived: false,
  content: { htmlContent: '<p>alt</p>' }, properties: { images: [] }, ...overrides,
});
const loadedOf = (overrides: Record<string, unknown> = {}): SectionModel => ({ ...stored(overrides), okey: 'a1' }) as unknown as SectionModel;
const edited = (overrides: Record<string, unknown> = {}): ArticleSection =>
  ({ ...stored(overrides), okey: 'a1', title: 'Neuer Titel', properties: { images: [], blocks: [{ id: 'b1', type: 'text', html: '<p>neu</p>' }] } }) as unknown as ArticleSection;

const SHARED = { tenants: ['scs', tenantId] };
const SYSTEM = { tenants: ['system'] };
const FORK_KEY = `a1_${tenantId}`;

describe('ArticleSaveService', () => {
  const sections = { create: vi.fn(), update: vi.fn() };
  const readObjectStrict = vi.fn();
  /** What the server holds, by path; an Error rejects. */
  let server: Record<string, unknown>;
  let service: ArticleSaveService;

  const save = (options: { isNew?: boolean; force?: boolean; section?: ArticleSection; loaded?: SectionModel } = {}) =>
    service.save(options.section ?? edited(), options.loaded ?? loadedOf(), { isNew: options.isNew ?? false, force: options.force ?? false, currentUser: user });

  const expectNoWrite = () => {
    expect(sections.create).not.toHaveBeenCalled();
    expect(sections.update).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    server = {};
    sections.create.mockReset().mockImplementation(async (section: SectionModel) => section.okey);
    sections.update.mockReset().mockImplementation(async (section: SectionModel) => section.okey);
    readObjectStrict.mockReset().mockImplementation(async (path: string) => {
      const value = server[path];
      if (value instanceof Error) throw value;
      return value ?? null;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        ArticleSaveService,
        { provide: ENV, useValue: { tenantId } },
        { provide: ArticleBlocksGate, useValue: { trial: false } },
        { provide: FirestoreService, useValue: { readObjectStrict } },
        { provide: SectionService, useValue: sections },
      ],
    });
    service = TestBed.inject(ArticleSaveService);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('a new article', () => {
    it('is created with its okey, without reading anything', async () => {
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(sections.create).toHaveBeenCalledTimes(1);
      expect(sections.create.mock.calls[0][0]).toMatchObject({ okey: 'a1', title: 'Neuer Titel' });
      expect(sections.create.mock.calls[0][1]).toBe(user);
      expect(sections.update).not.toHaveBeenCalled();
      expect(readObjectStrict).not.toHaveBeenCalled();
    });

    it('fails when create returns undefined (denied, or the okey is taken)', async () => {
      sections.create.mockResolvedValue(undefined);
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'failed' });
    });

    it('fails when create throws', async () => {
      sections.create.mockRejectedValue(new Error('boom'));
      await expect(save({ isNew: true })).resolves.toEqual({ status: 'failed' });
    });

    it('fails without an okey: the create would not be guarded', async () => {
      await expect(save({ isNew: true, section: { ...edited(), okey: '' } })).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });
  });

  describe('an own article', () => {
    it('is updated when nothing changed meanwhile', async () => {
      server['sections/a1'] = stored();
      await expect(save()).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(sections.update).toHaveBeenCalledTimes(1);
      expect(sections.update.mock.calls[0][0]).toMatchObject({ okey: 'a1', title: 'Neuer Titel', tenants: [tenantId] });
      expect(sections.update.mock.calls[0][1]).toBe(user);
      expect(readObjectStrict.mock.calls).toEqual([['sections/a1']]);
    });

    it('is not changed by a difference that only comes from loading', async () => {
      server['sections/a1'] = stored({ properties: { images: [] }, notes: '', tags: [] });
      await expect(save({ loaded: loadedOf({ subTitle: undefined, notes: null }) })).resolves.toMatchObject({ status: 'saved' });
    });

    it('is a conflict when it changed meanwhile', async () => {
      server['sections/a1'] = stored({ title: 'Von jemand anderem' });
      await expect(save()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
    });

    it('is updated over a change with force', async () => {
      server['sections/a1'] = stored({ title: 'Von jemand anderem' });
      await expect(save({ force: true })).resolves.toEqual({ status: 'saved', key: 'a1' });
      expect(sections.update).toHaveBeenCalledTimes(1);
    });

    it('compares the document as stored, without classic fields or defaults', async () => {
      const blocks = [{ id: 'b1', type: 'text', html: '<p>blocks</p>' }];
      server['sections/a1'] = stored({ content: { htmlContent: '' }, properties: { blocks } });
      await expect(save({ loaded: loadedOf({ content: { htmlContent: '' }, properties: { blocks } }) })).resolves.toMatchObject({ status: 'saved' });
      server['sections/a1'] = stored({ content: { htmlContent: '<p>blocks</p>' }, properties: { blocks, images: [] } });
      await expect(save({ loaded: loadedOf({ content: { htmlContent: '' }, properties: { blocks } }) })).resolves.toEqual({ status: 'conflict' });
    });

    it('fails when update returns undefined', async () => {
      server['sections/a1'] = stored();
      sections.update.mockResolvedValue(undefined);
      await expect(save()).resolves.toEqual({ status: 'failed' });
    });

    it('fails when update throws', async () => {
      server['sections/a1'] = stored();
      sections.update.mockRejectedValue(new Error('boom'));
      await expect(save()).resolves.toEqual({ status: 'failed' });
    });

    it('is offline when it cannot be read, also with force', async () => {
      server['sections/a1'] = new Error('client is offline');
      await expect(save()).resolves.toEqual({ status: 'offline' });
      await expect(save({ force: true })).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });

    it('fails without an okey, without reading', async () => {
      await expect(save({ section: { ...edited(), okey: '' } })).resolves.toEqual({ status: 'failed' });
      expect(readObjectStrict).not.toHaveBeenCalled();
      expectNoWrite();
    });

    it('is decided by the tenants of the server, not by those at opening', async () => {
      // it got a second tenant meanwhile: a fork, never `tenants: [own]` on the shared document
      server['sections/a1'] = stored(SHARED);
      await expect(save()).resolves.toMatchObject({ status: 'saved' });
      expect(sections.update.mock.calls[0][0].tenants).toEqual(SHARED.tenants);
    });

    it('does not bring a detached tenant back', async () => {
      server['sections/a1'] = stored();
      await expect(save({ section: edited(SHARED), loaded: loadedOf(SHARED) })).resolves.toMatchObject({ status: 'saved' });
      expect(sections.update.mock.calls[0][0].tenants).toEqual([tenantId]);
    });

    it('does not change the section it was given', async () => {
      server['sections/a1'] = stored();
      const section = Object.freeze(edited(SHARED));
      await save({ section });
      expect(section.tenants).toEqual(SHARED.tenants);
    });
  });

  describe.each([
    ['gone', null],
    ['archived', stored({ isArchived: true })],
    ['without the tenant', stored({ tenants: ['scs'] })],
    ['without tenants', stored({ tenants: undefined })],
    ['with malformed tenants', stored({ tenants: tenantId })],
  ])('an article that is %s', (_label, document) => {
    beforeEach(() => { server['sections/a1'] = document; });

    it('is gone without a fork, also with force', async () => {
      await expect(save()).resolves.toEqual({ status: 'gone' });
      await expect(save({ force: true })).resolves.toEqual({ status: 'gone' });
      expect(readObjectStrict).toHaveBeenCalledWith(`sections/${FORK_KEY}`);
      expectNoWrite();
    });

    it('is gone with an archived fork', async () => {
      server[`sections/${FORK_KEY}`] = stored({ isArchived: true });
      await expect(save({ force: true })).resolves.toEqual({ status: 'gone' });
      expectNoWrite();
    });

    it('is a conflict with a fork', async () => {
      server[`sections/${FORK_KEY}`] = stored();
      await expect(save()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
    });

    it('updates the fork with force', async () => {
      server[`sections/${FORK_KEY}`] = stored();
      await expect(save({ force: true, section: edited(SHARED), loaded: loadedOf(SHARED) })).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(sections.update.mock.calls[0][0]).toMatchObject({ okey: FORK_KEY, tenants: [tenantId], title: 'Neuer Titel' });
    });

    it('is offline when the fork cannot be read', async () => {
      server[`sections/${FORK_KEY}`] = new Error('denied');
      await expect(save({ force: true })).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });
  });

  describe.each([['shared', SHARED], ['system', SYSTEM]])('a %s article', (_label, tenants) => {
    const saveShared = (force = false) => save({ section: edited(tenants), loaded: loadedOf(tenants), force });
    beforeEach(() => { server['sections/a1'] = stored(tenants); });

    it('is forked by update when there is no fork and nothing changed', async () => {
      sections.update.mockResolvedValue(FORK_KEY);
      await expect(saveShared()).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(sections.update.mock.calls[0][0]).toMatchObject({ okey: 'a1', tenants: tenants.tenants });
      expect(readObjectStrict.mock.calls).toEqual([['sections/a1'], [`sections/${FORK_KEY}`]]);
    });

    it('is forked when the fork is archived', async () => {
      server[`sections/${FORK_KEY}`] = stored({ isArchived: true });
      await expect(saveShared()).resolves.toMatchObject({ status: 'saved' });
      expect(sections.update.mock.calls[0][0].okey).toBe('a1');
    });

    it('is a conflict when the original changed, and is forked with force', async () => {
      server['sections/a1'] = stored({ ...tenants, title: 'Von jemand anderem' });
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
      await expect(saveShared(true)).resolves.toMatchObject({ status: 'saved' });
      expect(sections.update.mock.calls[0][0]).toMatchObject({ okey: 'a1', tenants: tenants.tenants });
    });

    it('is a conflict when a fork appeared, even one with the same content', async () => {
      server[`sections/${FORK_KEY}`] = stored();
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      expectNoWrite();
    });

    it('updates the fork with force', async () => {
      server[`sections/${FORK_KEY}`] = stored();
      await expect(saveShared(true)).resolves.toEqual({ status: 'saved', key: FORK_KEY });
      expect(sections.update.mock.calls[0][0]).toMatchObject({ okey: FORK_KEY, tenants: [tenantId] });
    });

    it.each([[['scs']], [['scs', tenantId]], [['system']], [undefined]])('never writes over a fork document with tenants %j', async (forkTenants) => {
      server[`sections/${FORK_KEY}`] = stored({ tenants: forkTenants });
      await expect(saveShared()).resolves.toEqual({ status: 'conflict' });
      await expect(saveShared(true)).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('never writes over an archived fork document of others', async () => {
      server[`sections/${FORK_KEY}`] = stored({ tenants: ['scs'], isArchived: true });
      await expect(saveShared(true)).resolves.toEqual({ status: 'failed' });
      expectNoWrite();
    });

    it('fails when the fork cannot be written', async () => {
      sections.update.mockResolvedValue(undefined);
      await expect(saveShared()).resolves.toEqual({ status: 'failed' });
    });

    it('is offline when the fork cannot be read', async () => {
      server[`sections/${FORK_KEY}`] = new Error('offline');
      await expect(saveShared(true)).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });

    it('is offline when the original cannot be read', async () => {
      server['sections/a1'] = new Error('offline');
      await expect(saveShared(true)).resolves.toEqual({ status: 'offline' });
      expectNoWrite();
    });
  });

  describe('two calls at once', () => {
    it('write once and return one result', async () => {
      server['sections/a1'] = stored();
      const [first, second] = await Promise.all([save(), save({ force: true })]);
      expect(first).toEqual({ status: 'saved', key: 'a1' });
      expect(second).toBe(first);
      expect(sections.update).toHaveBeenCalledTimes(1);
      expect(readObjectStrict).toHaveBeenCalledTimes(1);
    });

    it('create once', async () => {
      await Promise.all([save({ isNew: true }), save({ isNew: true })]);
      expect(sections.create).toHaveBeenCalledTimes(1);
    });

    it('the next call after a result starts again', async () => {
      server['sections/a1'] = new Error('offline');
      await expect(save()).resolves.toEqual({ status: 'offline' });
      server['sections/a1'] = stored();
      await expect(save()).resolves.toMatchObject({ status: 'saved' });
    });

    it('of two different articles are both written', async () => {
      server['sections/a1'] = stored();
      server['sections/a2'] = stored();
      const results = await Promise.all([save(), save({ section: { ...edited(), okey: 'a2' } })]);
      expect(results).toEqual([{ status: 'saved', key: 'a1' }, { status: 'saved', key: 'a2' }]);
    });
  });
});

describe('ArticleSaveService in trial mode', () => {
  it.each([[true, false], [true, true], [false, false], [false, true]])('writes and reads nothing (isNew %s, force %s)', async (isNew, force) => {
    // every method of the gateway is a spy, and SectionService is the real one: a write through any helper would show
    const names = Object.getOwnPropertyNames(FirestoreService.prototype).filter((name) => name !== 'constructor');
    expect(names).toEqual(expect.arrayContaining(['createModel', 'updateModel', 'forkModel', 'getBatch', 'commitBatch', 'saveComment']));
    const firestore = Object.fromEntries(names.map((name) => [name, vi.fn()]));
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        ArticleSaveService, SectionService,
        { provide: ENV, useValue: { tenantId } },
        { provide: ArticleBlocksGate, useValue: { trial: true } },
        { provide: FirestoreService, useValue: firestore },
        { provide: I18nService, useValue: { translateAll: () => new Proxy({}, { get: () => () => '' }) } },
      ],
    });
    const service = TestBed.inject(ArticleSaveService);
    const sections = TestBed.inject(SectionService);
    const [create, update] = [vi.spyOn(sections, 'create'), vi.spyOn(sections, 'update')];
    const section = edited();

    await expect(service.save(section, loadedOf(), { isNew, force, currentUser: user })).resolves.toEqual({ status: 'saved', key: 'a1' });

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    for (const name of names) expect(firestore[name], name).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]).toContain(section);
    vi.restoreAllMocks();
  });
});
