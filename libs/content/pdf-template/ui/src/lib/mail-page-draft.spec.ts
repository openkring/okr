import { Injector } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArticleBlock, MailBlock } from '@okr/shared-models';

// the data-access barrel brings Firestore; the draft only needs the service's shape
vi.mock('@okr/content-pdf-template-data-access', () => ({ MailPageService: class MailPageService {} }));

import { MailPageService } from '@okr/content-pdf-template-data-access';
import { createHistory, mailArticle, record } from '@okr/cms-section-util';

import { MAIL_PAGE_SAVE_DEBOUNCE_MS, MailPageDraft } from './mail-page-draft';

const META = { subject: 'Hallo', layout: 'standard' as const, webVersion: false };
const text = (id: string, html: string): MailBlock => ({ id, type: 'text', html });

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const service = { saveDraft: vi.fn(() => Promise.resolve()), discardDraft: vi.fn(() => Promise.resolve()) };
  const injector = Injector.create({ providers: [{ provide: MailPageService, useValue: service }, { provide: MailPageDraft }] });
  const draft = injector.get(MailPageDraft);
  draft.start({ pageKey: 'p1', articleKey: 'a1', tenantId: 'scs', blocks: [text('t1', '')], meta: META });
  return { draft, service, injector };
}

/** One edit of the editor: the text with `html`. */
function type(draft: MailPageDraft, html: string, tag = 'typing'): void {
  const history = draft.history();
  const section = history.present.section;
  draft.setHistory(record(history, { ...history.present, section: { ...section, properties: { ...section.properties, blocks: [text('t1', html)] as ArticleBlock[] } } }, { tag }));
}

describe('MailPageDraft', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('holds the mail as one article of blocks', () => {
    const { draft } = setup();
    expect(draft.loaded()).toBe(true);
    expect(draft.blocks()).toEqual([text('t1', '')]);
    expect(draft.history().present.section).toEqual(mailArticle('scs', [text('t1', '')]));
    expect(draft.hasContent()).toBe(false);
    expect(draft.valid()).toBe(true);
  });

  it('writes the blocks 600 ms after the last change, with changedAt and the meta', async () => {
    const { draft, service } = setup();
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'));
    type(draft, '<p>H</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS - 1);
    type(draft, '<p>Hi</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS - 1);
    expect(service.saveDraft).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
    const [pageKey, articleKey, article, meta, changedAt] = service.saveDraft.mock.calls[0] as unknown as [string, string, Record<string, unknown>, unknown, string];
    expect([pageKey, articleKey, meta]).toEqual(['p1', 'a1', META]);
    expect(changedAt).toBe(new Date().toISOString());
    expect(article).toEqual(mailArticle('scs', [text('t1', '<p>Hi</p>')]));
    expect(draft.hasContent()).toBe(true);
  });

  it('stores blocks and no old field of an article', () => {
    const { draft, service } = setup();
    type(draft, '<p>Hi</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    const article = (service.saveDraft.mock.calls[0] as unknown as unknown[])[2] as Record<string, unknown>;
    expect(article['properties']).toEqual({ blocks: [text('t1', '<p>Hi</p>')] });
    expect(article).not.toHaveProperty('content');
    expect(JSON.stringify(article)).not.toMatch(/htmlContent|"images"|"cta"/);
    expect(article['tenants']).toEqual(['scs']);
  });

  it('does not write a change of the selection alone', () => {
    const { draft, service } = setup();
    const history = draft.history();
    draft.setHistory({ ...history, present: { ...history.present, selectedId: 't1' } });
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    expect(service.saveDraft).not.toHaveBeenCalled();
    expect(draft.history().present.selectedId).toBe('t1');
  });

  it('writes a changed meta, an equal one not', () => {
    const { draft, service } = setup();
    draft.setMeta({ ...META });
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    expect(service.saveDraft).not.toHaveBeenCalled();
    draft.setMeta({ ...META, subject: 'Neu', webVersion: true });
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    expect((service.saveDraft.mock.calls[0] as unknown as unknown[])[3]).toEqual({ ...META, subject: 'Neu', webVersion: true });
  });

  it('setBlocks is one step of the history', () => {
    const { draft } = setup();
    draft.setBlocks([text('t1', '<p>a</p>'), { id: 'd', type: 'divider' }]);
    expect(draft.blocks()).toHaveLength(2);
    expect(draft.history().past).toHaveLength(1);
  });

  it('flush writes at once and waits for the write', async () => {
    const { draft, service } = setup();
    const write = deferred();
    service.saveDraft.mockReturnValueOnce(write.promise);
    type(draft, '<p>Hi</p>');
    let done: boolean | undefined;
    const flushing = draft.flush().then((ok) => { done = ok; });
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(done).toBeUndefined();
    write.resolve();
    await flushing;
    expect(done).toBe(true);
  });

  it('flush tries a failed write once more, and says when it failed again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { draft, service } = setup();
    service.saveDraft.mockRejectedValueOnce(new Error('offline'));
    type(draft, '<p>Hi</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    await Promise.resolve(); await Promise.resolve();
    expect(draft.saveFailed()).toBe(true);
    expect(await draft.flush()).toBe(true);
    expect(service.saveDraft).toHaveBeenCalledTimes(2);
    expect(draft.saveFailed()).toBe(false);

    service.saveDraft.mockRejectedValue(new Error('offline'));
    type(draft, '<p>Hi du</p>');
    expect(await draft.flush()).toBe(false);
    expect(service.saveDraft).toHaveBeenCalledTimes(4);
  });

  it('flush with nothing to write resolves at once', async () => {
    const { draft, service } = setup();
    expect(await draft.flush()).toBe(true);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('a discard waits for a write under way, then deletes, and drops what was not written', async () => {
    const { draft, service } = setup();
    const write = deferred();
    service.saveDraft.mockReturnValueOnce(write.promise);
    type(draft, '<p>Hi</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    type(draft, '<p>Hi du</p>');
    const discarding = draft.discard();
    expect(draft.loaded()).toBe(false);
    await Promise.resolve();
    expect(service.discardDraft).not.toHaveBeenCalled();
    write.resolve();
    await discarding;
    expect(service.discardDraft).toHaveBeenCalledWith('p1');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
    type(draft, '<p>later</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('a sent page is never deleted', async () => {
    const { draft, service } = setup();
    draft.markSent();
    await draft.discard();
    expect(service.discardDraft).not.toHaveBeenCalled();
  });

  it('a sent page is never written again: a waiting change is dropped, a later one not scheduled', async () => {
    const { draft, service } = setup();
    type(draft, '<p>Hi</p>');
    draft.markSent();
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    type(draft, '<p>Hi du</p>');
    draft.setMeta({ ...META, subject: 'Neu' });
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    expect(await draft.flush()).toBe(true);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('a change still waiting when the composer goes is never written', () => {
    const { draft, service, injector } = setup();
    type(draft, '<p>Hi</p>');
    (injector as unknown as { destroy(): void }).destroy();
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    type(draft, '<p>Hi du</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS * 2);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('a draft whose last change could not be stored is not kept: a discard still deletes it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { draft, service } = setup();
    service.saveDraft.mockRejectedValue(new Error('offline'));
    type(draft, '<p>Hi</p>');
    expect(await draft.keep()).toBe(false);
    await draft.discard();
    expect(service.discardDraft).toHaveBeenCalledWith('p1');
  });

  it('a kept page is written and never deleted', async () => {
    const { draft, service } = setup();
    type(draft, '<p>Hi</p>');
    expect(await draft.keep()).toBe(true);
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
    await draft.discard();
    expect(service.discardDraft).not.toHaveBeenCalled();
  });

  it('start after a discard works on the new draft with a new history', async () => {
    const { draft, service } = setup();
    type(draft, '<p>Hi</p>');
    await draft.discard();
    draft.start({ pageKey: 'p2', articleKey: 'a2', tenantId: 'scs', blocks: [text('n1', '')], meta: META, selectedId: 'n1' });
    expect(draft.loaded()).toBe(true);
    expect(draft.history().past).toHaveLength(0);
    expect(draft.history().present.selectedId).toBe('n1');
    type(draft, '<p>neu</p>');
    vi.advanceTimersByTime(MAIL_PAGE_SAVE_DEBOUNCE_MS);
    expect(service.saveDraft).toHaveBeenCalledTimes(1);
    expect((service.saveDraft.mock.calls[0] as unknown as unknown[]).slice(0, 2)).toEqual(['p2', 'a2']);
    await draft.discard();
    expect(service.discardDraft).toHaveBeenLastCalledWith('p2');
  });

  it('counts the blocks with errors', () => {
    const { draft } = setup();
    draft.setHistory(createHistory({ section: mailArticle('scs', [{ id: 'b', type: 'button', cta: { label: '', url: '', style: 'primary' } }]), copiedFrom: {} }));
    expect(draft.valid()).toBe(false);
    expect(draft.errorCount()).toBe(1);
    expect(Object.keys(draft.errors()).length).toBeGreaterThan(0);
  });
});
