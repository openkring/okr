import { describe, expect, it } from 'vitest';
import {
  albumFolderKeyOfPath, contentDisposition, isAlbumVideoObjectPath, MAX_VIDEO_KEYS, MP4_PARAMS, validVideoKeys, videoAccessPath, WINDOW_MS, windowExpiry,
} from './video-sign.util';

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

describe('MP4_PARAMS', () => {
  // imgix scales UP to h=720 without fit=max: a 320x240 camera AVI came back as 960x720 and a
  // 640x360 clip as 1280x720 at twice the bytes (measured 2026-10-03 on bkaiser-private).
  it('caps at 720 lines without upscaling smaller videos', () => {
    expect(MP4_PARAMS).toMatchObject({ fm: 'mp4', h: 720, fit: 'max' });
  });
});

describe('validVideoKeys', () => {
  it('drops non-strings, empties and duplicates and caps the count', () => {
    expect(validVideoKeys(['a', '', 3, 'a', 'b'])).toEqual(['a', 'b']);
    expect(validVideoKeys('a')).toEqual([]);
    expect(validVideoKeys(Array.from({ length: 150 }, (_, i) => `k${i}`))).toHaveLength(MAX_VIDEO_KEYS);
  });
  it('drops keys that are not a single document id', () => {
    expect(validVideoKeys(['a/b', '.', '..', 'ok'])).toEqual(['ok']);
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

describe('videoAccessPath — only the album video layout (confused-deputy guard)', () => {
  const folders = { f1: folder() };
  const reject = (fullPath: string) => expect(videoAccessPath(doc({ fullPath, mimeType: 'video/mp4' }), folders, 'scs')).toBeNull();
  it('rejects a private export disguised as a video', () => { reject('tenant/scs/private/exports/u1/export.zip'); });
  it('rejects an invoice', () => { reject('tenant/scs/private/finance/invoices/k.pdf'); });
  it('rejects a rendering', () => { reject('tenant/scs/section/s1/album/renderings/v1.mp4'); });
  it('rejects dot-dot traversal', () => { reject('tenant/scs/section/s1/album/ab/../../../private/x.mov'); });
  it('rejects a document-list path', () => { reject('tenant/scs/document/x.mov'); });
  it('accepts a folder album video with an upper-case extension', () => {
    expect(videoAccessPath(doc({ fullPath: 'tenant/scs/folder/f1/album/ab12/IMG_1.MOV' }), folders, 'scs'))
      .toBe('tenant/scs/folder/f1/album/ab12/IMG_1.MOV');
  });
});

describe('isAlbumVideoObjectPath', () => {
  it('rejects empty segments and a file directly under album/', () => {
    expect(isAlbumVideoObjectPath('tenant/scs/section/s1/album//x.mov', 'scs')).toBe(false);
    expect(isAlbumVideoObjectPath('tenant/scs/section/s1/album/x.mov', 'scs')).toBe(false);
  });
  it('does not treat the tenant id as a pattern', () => {
    expect(isAlbumVideoObjectPath('tenant/sXs/section/s1/album/ab/x.mov', 's.s')).toBe(false);
  });
  it('accepts nested sub-paths', () => {
    expect(isAlbumVideoObjectPath('tenant/scs/section/s1/album/ab/c/d.mp4', 'scs')).toBe(true);
  });
  it('accepts an AVI original, case-insensitively (spec 1.82)', () => {
    expect(isAlbumVideoObjectPath('tenant/scs/folder/f1/album/ab/clip.AVI', 'scs')).toBe(true);
    expect(isAlbumVideoObjectPath('tenant/scs/folder/f1/album/ab/clip.avi', 'scs')).toBe(true);
  });
  it('still rejects other extensions and the renderings sub-folder', () => {
    expect(isAlbumVideoObjectPath('tenant/scs/folder/f1/album/ab/clip.mkv', 'scs')).toBe(false);
    expect(isAlbumVideoObjectPath('tenant/scs/folder/f1/album/renderings/clip.avi', 'scs')).toBe(false);
  });
});

describe('albumFolderKeyOfPath', () => {
  it('returns the folder key of a folder album path', () => {
    expect(albumFolderKeyOfPath('tenant/scs/folder/f1/album/ab/clip.mp4', 'scs')).toBe('f1');
  });
  it('is undefined for a section path, another tenant or a non-album path', () => {
    expect(albumFolderKeyOfPath('tenant/scs/section/s1/album/ab/clip.mp4', 'scs')).toBeUndefined();
    expect(albumFolderKeyOfPath('tenant/kring/folder/f1/album/ab/clip.mp4', 'scs')).toBeUndefined();
    expect(albumFolderKeyOfPath('tenant/scs/folder/f1/files/clip.mp4', 'scs')).toBeUndefined();
    expect(albumFolderKeyOfPath('tenant/sXs/folder/f1/album/ab/clip.mp4', 's.s')).toBeUndefined();
  });
});

describe('contentDisposition', () => {
  it('carries an ASCII fallback and the UTF-8 original', () => {
    const d = contentDisposition('Rückblick.mov', 'tenant/scs/section/s1/album/ab/x.mov');
    expect(d).toContain('filename="R_ckblick.mov"');
    expect(d).toContain("filename*=UTF-8''R%C3%BCckblick.mov");
  });
  it('appends the extension of the path when the title has none', () => {
    const d = contentDisposition('Regatta', 'tenant/scs/section/s1/album/ab/IMG_1.mov');
    expect(d).toContain('filename="Regatta.mov"');
    expect(d).toContain("filename*=UTF-8''Regatta.mov");
  });
  it('sanitizes quote and backslash in the fallback', () => {
    const d = contentDisposition('a"b\\c.mp4', 'tenant/scs/section/s1/album/ab/x.mp4');
    expect(d).toContain('filename="a_b_c.mp4"');
  });
  it('falls back to the file name for an empty title', () => {
    expect(contentDisposition('', 'tenant/scs/section/s1/album/ab/IMG_1.MOV')).toContain('filename="IMG_1.MOV"');
  });
});
