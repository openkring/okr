import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArticleSection } from '@okr/shared-models';

import { openArticleEditor, type ArticleEditorHost, type ArticleEditorOptions } from './article-editor.loader';

vi.mock('./article-editor.modal', () => ({ ArticleEditorModal: class ArticleEditorModal {} }));

describe('openArticleEditor', () => {
  const section = { okey: 'a1', type: 'article' } as ArticleSection;
  const options = { isNew: false, tagModel: 'section' } as ArticleEditorOptions;
  const toast = { present: vi.fn() };
  const create = vi.fn();
  const createToast = vi.fn();
  const handleError = vi.fn();
  const host = { modalController: { create }, toastController: { create: createToast }, errorHandler: { handleError }, openFailed: () => 'Der Editor …' } as unknown as ArticleEditorHost;

  /** a window that is closed by `dismiss`; a listener that comes after that hears nothing */
  function modalMock(present: () => Promise<void> = () => Promise.resolve()) {
    const listeners: (() => void)[] = [];
    return {
      present: vi.fn(present),
      onWillDismiss: vi.fn(() => new Promise<void>((resolve) => { listeners.push(resolve); })),
      dismiss: () => listeners.forEach((listener) => listener()),
    };
  }
  const saves = (): ((key: string) => void) => create.mock.calls[0][0].componentProps.onSaved;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createToast.mockResolvedValue(toast);
  });

  it('is over as soon as the window is shown, even when nothing ever says that it was closed', async () => {
    create.mockResolvedValue(modalMock());
    const opened = await openArticleEditor(host, section, options);
    expect(opened).toEqual({ closed: expect.any(Promise) });
    expect(create.mock.calls[0][0].componentProps).toMatchObject({ section, ...options });
    expect(createToast).not.toHaveBeenCalled();
  });

  it('waits for the window', async () => {
    let shown: () => void = () => undefined;
    const modal = modalMock(() => new Promise<void>((resolve) => { shown = resolve; }));
    create.mockResolvedValue(modal);
    const done = vi.fn();
    const opening = openArticleEditor(host, section, options).then(done);
    await vi.waitFor(() => expect(modal.present).toHaveBeenCalled());
    expect(done).not.toHaveBeenCalled();
    shown();
    await opening;
    expect(done).toHaveBeenCalled();
  });

  it('closed is the key of the last save, or undefined', async () => {
    const modal = modalMock();
    create.mockResolvedValue(modal);
    const opened = await openArticleEditor(host, section, options);
    saves()('a1');
    saves()('a1_p13');
    modal.dismiss();
    await expect(opened?.closed).resolves.toBe('a1_p13');

    const other = modalMock();
    create.mockResolvedValue(other);
    const again = await openArticleEditor(host, section, options);
    other.dismiss();
    await expect(again?.closed).resolves.toBeUndefined();
  });

  it('hears a window that is closed while it is being shown', async () => {
    const modal = modalMock(async () => { modal.dismiss(); });
    create.mockResolvedValue(modal);
    const opened = await openArticleEditor(host, section, options);
    await expect(opened?.closed).resolves.toBeUndefined();
  });

  describe('a failed opening', () => {
    const error = new Error('Failed to fetch dynamically imported module: https://x/chunk-1.js');

    it.each([
      ['create', () => create.mockRejectedValue(error)],
      ['present', () => create.mockResolvedValue(modalMock(() => Promise.reject(error)))],
    ])('(%s) says so, reaches the stale-chunk recovery of the app, and does not reject', async (_label, fail) => {
      fail();
      await expect(openArticleEditor(host, section, options)).resolves.toBeUndefined();
      expect(createToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Der Editor …' }));
      expect(toast.present).toHaveBeenCalledTimes(1);
      expect(handleError.mock.calls).toEqual([[error]]);
    });

    it('offline: no reload', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      create.mockRejectedValue(error);
      await expect(openArticleEditor(host, section, options)).resolves.toBeUndefined();
      expect(createToast).toHaveBeenCalledTimes(1);
      expect(handleError).not.toHaveBeenCalled();
    });

    it('does not reject when the toast fails too', async () => {
      create.mockRejectedValue(error);
      createToast.mockRejectedValue(new Error('no toast'));
      await expect(openArticleEditor(host, section, options)).resolves.toBeUndefined();
      expect(handleError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('openArticleEditor without its chunk', () => {
  it('a rejected import is a failed opening', async () => {
    vi.resetModules();
    vi.doMock('./article-editor.modal', () => { throw new Error('chunk'); });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = await import('./article-editor.loader');
    const handleError = vi.fn();
    const createToast = vi.fn().mockResolvedValue({ present: vi.fn() });
    const host = { modalController: { create: vi.fn() }, toastController: { create: createToast }, errorHandler: { handleError }, openFailed: () => 'x' } as unknown as ArticleEditorHost;
    await expect(loader.openArticleEditor(host, {} as ArticleSection, {} as ArticleEditorOptions)).resolves.toBeUndefined();
    expect(createToast).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledTimes(1);
  });
});
