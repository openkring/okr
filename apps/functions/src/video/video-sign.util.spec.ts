import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_KEYS, validVideoKeys, videoAccessPath, WINDOW_MS, windowExpiry } from './video-sign.util';

const HOUR = 3600 * 1000;
const doc = (over: Record<string, unknown> = {}) => ({
  tenants: ['scs'], isArchived: false, mimeType: 'video/quicktime',
  fullPath: 'tenant/scs/section/s1/album/ab12/clip.mov', folderKeys: ['f1'], ...over,
});
const folder = (over: Record<string, unknown> = {}) => ({ tenants: ['scs'], isArchived: false, ...over });

describe('windowExpiry', () => {
  it('is identical for two calls within one window', () => {
    const t = Date.UTC(2026, 9, 3, 7, 0, 0);
    expect(windowExpiry(t)).toBe(windowExpiry(t + 30 * 60 * 1000));
  });
  it('always leaves at least one hour of validity', () => {
    const t = Date.UTC(2026, 9, 3, 5, 59, 0);   // one minute before a 6h boundary
    expect(windowExpiry(t) - t).toBeGreaterThanOrEqual(HOUR);
    expect(windowExpiry(t) - t).toBeLessThanOrEqual(HOUR + WINDOW_MS);
  });
  it('lands on a window boundary', () => {
    expect(windowExpiry(Date.UTC(2026, 9, 3, 1)) % WINDOW_MS).toBe(0);
  });
});

describe('validVideoKeys', () => {
  it('drops non-strings, empties and duplicates and caps the count', () => {
    expect(validVideoKeys(['a', '', 3, 'a', 'b'])).toEqual(['a', 'b']);
    expect(validVideoKeys('a')).toEqual([]);
    expect(validVideoKeys(Array.from({ length: 150 }, (_, i) => `k${i}`))).toHaveLength(MAX_VIDEO_KEYS);
  });
});

describe('videoAccessPath', () => {
  const folders = { f1: folder() };
  it('returns the path for a live video of the caller tenant in a live folder', () => {
    expect(videoAccessPath(doc(), folders, 'scs')).toBe('tenant/scs/section/s1/album/ab12/clip.mov');
  });
  it('omits another tenant', () => { expect(videoAccessPath(doc({ tenants: ['kwo'] }), folders, 'scs')).toBeNull(); });
  it('omits an archived document', () => { expect(videoAccessPath(doc({ isArchived: true }), folders, 'scs')).toBeNull(); });
  it('omits a non-video', () => { expect(videoAccessPath(doc({ mimeType: 'image/jpeg' }), folders, 'scs')).toBeNull(); });
  it('omits a missing document', () => { expect(videoAccessPath(undefined, folders, 'scs')).toBeNull(); });
  it('omits a document whose path leaves its tenant', () => {
    expect(videoAccessPath(doc({ fullPath: 'tenant/kwo/section/s1/album/x.mov' }), folders, 'scs')).toBeNull();
  });
  it('omits a document whose only folder is archived or missing', () => {
    expect(videoAccessPath(doc(), { f1: folder({ isArchived: true }) }, 'scs')).toBeNull();
    expect(videoAccessPath(doc(), {}, 'scs')).toBeNull();
  });
  it('accepts when one of several folders is live', () => {
    expect(videoAccessPath(doc({ folderKeys: ['f0', 'f1'] }), { f0: folder({ isArchived: true }), f1: folder() }, 'scs')).not.toBeNull();
  });
  it('accepts a document without folders (document list upload)', () => {
    expect(videoAccessPath(doc({ folderKeys: [] }), {}, 'scs')).not.toBeNull();
  });
});
