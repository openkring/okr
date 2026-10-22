import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileTransferView } from './file-transfer-api';
import { openFileTransferFile } from './file-transfer-open';

const view: FileTransferView = {
  transferKey: 't1',
  senderName: 'Anna',
  message: '',
  expiresAt: '2026-11-01T00:00:00.000Z',
  needsPassword: false,
  files: [
    { index: 0, name: 'clip.mp4', size: 10, contentType: 'video/mp4' },
    { index: 1, name: 'plan.pdf', size: 10, contentType: 'application/pdf' },
  ],
};

function fakeTab() {
  return { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
}

describe('openFileTransferFile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the url of an inline video for the page player and opens no tab', async () => {
    const open = vi.spyOn(window, 'open');
    const outcome = await openFileTransferFile(view, { fileIndex: 0, disposition: 'inline' }, async () => 'https://signed/v');
    expect(outcome).toEqual({ kind: 'video', url: 'https://signed/v', name: 'clip.mp4' });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens an inline video in its own tab with videoInTab (chat)', async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const outcome = await openFileTransferFile(view, { fileIndex: 0, disposition: 'inline' }, async () => 'https://signed/v', { videoInTab: true });
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('https://signed/v');
    expect(outcome).toEqual({ kind: 'done' });
  });

  it('opens the tab before the url is fetched (user gesture) and closes it on failure', async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const getUrl = vi.fn(async () => { throw new Error('expired'); });
    const promise = openFileTransferFile(view, { fileIndex: 1, disposition: 'inline' }, getUrl);
    expect(open).toHaveBeenCalledTimes(1);   // synchronously, before any await
    await expect(promise).rejects.toThrow('expired');
    expect(tab.close).toHaveBeenCalled();
  });
});
