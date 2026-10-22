import { orphanAction, reapAction } from './reap-file-transfers';

const NOW = '2026-10-22T12:00:00.000Z';
const HOUR = 3600 * 1000;
const ago = (h: number) => new Date(new Date(NOW).getTime() - h * HOUR).toISOString();

describe('reapAction', () => {
  it('expires an open transfer past its expiry', () => {
    expect(reapAction({ state: 'open', expiresAt: ago(1), createdAt: ago(100) }, NOW)).toBe('expire');
  });
  it('keeps an open transfer before its expiry', () => {
    expect(reapAction({ state: 'open', expiresAt: ago(-1), createdAt: ago(100) }, NOW)).toBe('none');
  });
  it('drops an upload older than 24 h', () => {
    expect(reapAction({ state: 'uploading', expiresAt: ago(-100), createdAt: ago(25) }, NOW)).toBe('dropUpload');
  });
  it('keeps an upload younger than 24 h', () => {
    expect(reapAction({ state: 'uploading', expiresAt: ago(-100), createdAt: ago(23) }, NOW)).toBe('none');
  });
  it('leaves ended and expired transfers alone', () => {
    expect(reapAction({ state: 'ended', expiresAt: ago(10), createdAt: ago(100) }, NOW)).toBe('none');
    expect(reapAction({ state: 'expired', expiresAt: ago(10), createdAt: ago(100) }, NOW)).toBe('none');
  });
  it('does nothing on unparsable dates', () => {
    expect(reapAction({ state: 'open', expiresAt: '', createdAt: '' }, NOW)).toBe('none');
    expect(reapAction({ state: 'uploading', expiresAt: '', createdAt: 'x' }, NOW)).toBe('none');
  });
});

describe('orphanAction', () => {
  it('deletes the files of a missing, ended or expired transfer', () => {
    expect(orphanAction(undefined, NOW)).toBe('delete');
    expect(orphanAction({ state: 'ended', createdAt: ago(1) }, NOW)).toBe('delete');
    expect(orphanAction({ state: 'expired', createdAt: ago(1) }, NOW)).toBe('delete');
  });
  it('keeps an open transfer', () => {
    expect(orphanAction({ state: 'open', createdAt: ago(1000) }, NOW)).toBe('keep');
  });
  it('keeps an upload under 24 h, deletes one over 24 h', () => {
    expect(orphanAction({ state: 'uploading', createdAt: ago(23) }, NOW)).toBe('keep');
    expect(orphanAction({ state: 'uploading', createdAt: ago(25) }, NOW)).toBe('delete');
  });
  it('keeps an upload with an unparsable date', () => {
    expect(orphanAction({ state: 'uploading', createdAt: '' }, NOW)).toBe('keep');
  });
});
