import { isFileTransferRejection, summarizeFileTransferEvents, summarizeFileTransferEventsByTransfer } from './file-transfer-events';

const ev = (transferKey: string, type: 'created' | 'opened' | 'downloaded' | 'ended', recipientId = '') => ({ transferKey, type, recipientId });

describe('summarizeFileTransferEvents', () => {
  it('is empty for no events', () => {
    expect(summarizeFileTransferEvents([])).toEqual({ opens: 0, downloads: 0, downloadsPerRecipient: {} });
  });
  it('counts opens and downloads, per recipient for downloads', () => {
    const s = summarizeFileTransferEvents([
      ev('t', 'created'), ev('t', 'opened', 'p:a'), ev('t', 'opened', 'e:x@y.ch'),
      ev('t', 'downloaded', 'p:a'), ev('t', 'downloaded', 'p:a'), ev('t', 'downloaded', 'e:x@y.ch'), ev('t', 'ended'),
    ]);
    expect(s).toEqual({ opens: 2, downloads: 3, downloadsPerRecipient: { 'p:a': 2, 'e:x@y.ch': 1 } });
  });
  it('counts a download without recipient in the total only', () => {
    expect(summarizeFileTransferEvents([ev('t', 'downloaded')])).toEqual({ opens: 0, downloads: 1, downloadsPerRecipient: {} });
  });
});

describe('summarizeFileTransferEventsByTransfer', () => {
  it('groups by transferKey', () => {
    const m = summarizeFileTransferEventsByTransfer([ev('a', 'opened', 'p:1'), ev('b', 'downloaded', 'p:2'), ev('a', 'downloaded', 'p:1')]);
    expect(m.get('a')).toEqual({ opens: 1, downloads: 1, downloadsPerRecipient: { 'p:1': 1 } });
    expect(m.get('b')).toEqual({ opens: 0, downloads: 1, downloadsPerRecipient: { 'p:2': 1 } });
    expect(m.get('c')).toBeUndefined();
  });
});

describe('isFileTransferRejection', () => {
  it('recognises rejection codes only', () => {
    expect(isFileTransferRejection('tooLarge')).toBe(true);
    expect(isFileTransferRejection('notUploading')).toBe(false);
    expect(isFileTransferRejection('')).toBe(false);
  });
});
