import { computeExpiresAt, fileTransferDisplayState, isFileTransferAccessible } from './file-transfer-state';

describe('file-transfer state', () => {
  it('computeExpiresAt adds days', () => {
    expect(computeExpiresAt('2026-10-22T10:00:00.000Z', 7)).toBe('2026-10-29T10:00:00.000Z');
  });
  const now = '2026-10-22T10:00:00.000Z';
  const future = '2026-10-29T10:00:00.000Z';
  it('open and not expired is accessible', () => expect(isFileTransferAccessible({ state: 'open', expiresAt: future }, now)).toBe(true));
  it('ended/expired/uploading are not', () => {
    for (const state of ['ended', 'expired', 'uploading'] as const) {
      expect(isFileTransferAccessible({ state, expiresAt: future }, now)).toBe(false);
    }
  });
  it('open past expiresAt is not', () => expect(isFileTransferAccessible({ state: 'open', expiresAt: '2026-10-21T10:00:00.000Z' }, now)).toBe(false));
});

describe('fileTransferDisplayState', () => {
  const now = '2026-10-22T12:00:00.000Z';
  it('keeps open while the lifetime runs', () => {
    expect(fileTransferDisplayState({ state: 'open', expiresAt: '2026-10-23T00:00:00.000Z' }, now)).toBe('open');
  });
  it('shows expired once the lifetime ran out, before the reaper marked it', () => {
    expect(fileTransferDisplayState({ state: 'open', expiresAt: '2026-10-22T11:59:59.000Z' }, now)).toBe('expired');
  });
  it('passes every other state through', () => {
    expect(fileTransferDisplayState({ state: 'uploading', expiresAt: '' }, now)).toBe('uploading');
    expect(fileTransferDisplayState({ state: 'ended', expiresAt: '2030-01-01T00:00:00.000Z' }, now)).toBe('ended');
    expect(fileTransferDisplayState({ state: 'expired', expiresAt: '' }, now)).toBe('expired');
  });
});
