import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  assertChatFolders, chatFolderKeys, chatVideoPath, MAX_VIDEO_BYTES, safeVideoFileName, safeVideoTitle, validateChatVideoRequest, zurichStoreDate,
} from './chat-video.util';
import { isAlbumVideoObjectPath } from './video-sign.util';

describe('chatFolderKeys', () => {
  it('is deterministic and follows the root/year/videos layout', () => {
    const a = chatFolderKeys('scs', '!abc:hs', '2026');
    expect(chatFolderKeys('scs', '!abc:hs', '2026')).toEqual(a);
    expect(a.root).toMatch(/^chat_[0-9a-f]{20}$/);
    expect(a.year).toBe(`${a.root}_2026`);
    expect(a.videos).toBe(`${a.root}_2026_videos`);
  });

  it('differs per room and per tenant', () => {
    const base = chatFolderKeys('scs', '!abc:hs', '2026').root;
    expect(chatFolderKeys('scs', '!xyz:hs', '2026').root).not.toBe(base);
    expect(chatFolderKeys('kring', '!abc:hs', '2026').root).not.toBe(base);
  });
});

describe('chatVideoPath', () => {
  const keys = chatFolderKeys('scs', '!abc:hs', '2026');
  it.each(['clip.mov', 'CLIP.MP4', 'old.avi'])('%s satisfies isAlbumVideoObjectPath and keeps its extension', name => {
    const path = chatVideoPath('scs', keys.videos, name, 'r4nd0m');
    expect(path.startsWith(`tenant/scs/folder/${keys.videos}/album/r4nd0m/`)).toBe(true);
    expect(isAlbumVideoObjectPath(path, 'scs')).toBe(true);
    expect(path.endsWith(name.slice(name.lastIndexOf('.')))).toBe(true);
  });

  it('neutralises a traversal file name', () => {
    const path = chatVideoPath('scs', keys.videos, '../../x.mov', 'r');
    expect(isAlbumVideoObjectPath(path, 'scs')).toBe(true);
    expect(path.split('/')).toHaveLength(7);
  });
});

describe('safeVideoFileName', () => {
  it('removes slashes and leading dots but keeps the extension', () => {
    const name = safeVideoFileName('../../x.mov');
    expect(name).not.toContain('/');
    expect(name.startsWith('.')).toBe(false);
    expect(name.endsWith('.mov')).toBe(true);
  });

  it('replaces backslashes and control characters', () => {
    const name = safeVideoFileName('a\\b\u0000c\nd.mp4');
    expect(name).not.toMatch(/[\\\u0000-\u001f]/);
    expect(name.endsWith('.mp4')).toBe(true);
  });
});

describe('validateChatVideoRequest', () => {
  const ok = { roomId: '!abc:hs', roomName: 'Vorstand', fileName: 'clip.mov', size: 1000, mimeType: 'video/quicktime' };
  const rejects = (data: unknown) => {
    try {
      validateChatVideoRequest(data);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
      expect((e as HttpsError).code).toBe('invalid-argument');
      return;
    }
    throw new Error('expected invalid-argument');
  };

  it('accepts a valid request', () => {
    expect(validateChatVideoRequest(ok)).toEqual(ok);
  });
  it('accepts .avi and the size limit exactly', () => {
    expect(validateChatVideoRequest({ ...ok, fileName: 'x.AVI', size: MAX_VIDEO_BYTES }).size).toBe(MAX_VIDEO_BYTES);
  });
  it('defaults a missing roomName and mimeType to empty strings', () => {
    const r = validateChatVideoRequest({ roomId: ok.roomId, fileName: ok.fileName, size: ok.size });
    expect(r.roomName).toBe('');
    expect(r.mimeType).toBe('');
  });
  it('rejects size 0', () => rejects({ ...ok, size: 0 }));
  it('rejects size above 200 MB', () => rejects({ ...ok, size: 200 * 1024 * 1024 + 1 }));
  it('rejects a non-integer size', () => rejects({ ...ok, size: 1.5 }));
  it('rejects .mkv', () => rejects({ ...ok, fileName: 'x.mkv' }));
  it('rejects a roomId without !', () => rejects({ ...ok, roomId: 'abc:hs' }));
  it('rejects a missing fileName', () => rejects({ ...ok, fileName: undefined }));
  it('rejects a non-object', () => rejects(null));
});

describe('zurichStoreDate', () => {
  it('uses the Zurich calendar day around New Year', () => {
    expect(zurichStoreDate(new Date('2026-12-31T23:30:00Z'))).toBe('20270101');
    expect(zurichStoreDate(new Date('2026-12-31T22:30:00Z'))).toBe('20261231');
  });
  it('handles summer time (UTC+2)', () => {
    expect(zurichStoreDate(new Date('2026-07-14T22:30:00Z'))).toBe('20260715');
  });
});

describe('safeVideoTitle', () => {
  it('keeps a normal name unchanged', () => {
    expect(safeVideoTitle('Regatta Tag 1.mov')).toBe('Regatta Tag 1.mov');
  });
  it('strips control and bidi-override characters', () => {
    expect(safeVideoTitle('a\u0000b\u001fc\u007fd\u202Ee\u2066f\u2069.mov')).toBe('abcdef.mov');
  });
  it('caps at 120 characters', () => {
    expect(safeVideoTitle('x'.repeat(300) + '.mov')).toHaveLength(120);
  });
  it('falls back when nothing visible is left', () => {
    expect(safeVideoTitle('\u202E\u0001')).toBe('video');
  });
});

describe('assertChatFolders', () => {
  const k = chatFolderKeys('scs', '!abc:hs', '2026');
  const good = () => ({
    root: { matrixRoomId: '!abc:hs', parents: [], tenants: ['scs'], isArchived: false },
    year: { matrixRoomId: '', parents: [k.root], tenants: ['scs'], isArchived: false },
    videos: { matrixRoomId: '', parents: [k.year], tenants: ['scs'], isArchived: false },
  });
  const code = (f: ReturnType<typeof good>) => {
    try { assertChatFolders(f, k, '!abc:hs', 'scs'); } catch (e) { return (e as HttpsError).code; }
    return 'ok';
  };
  it('accepts the intact chain', () => expect(code(good())).toBe('ok'));
  it('accepts legacy folders without isArchived', () => {
    const f = good(); delete (f.videos as Record<string, unknown>)['isArchived'];
    expect(code(f)).toBe('ok');
  });
  it('refuses a root of another room', () => { const f = good(); f.root.matrixRoomId = '!x:hs'; expect(code(f)).toBe('failed-precondition'); });
  it('refuses a moved year folder', () => { const f = good(); f.year.parents = ['elsewhere']; expect(code(f)).toBe('failed-precondition'); });
  it('refuses a moved videos folder', () => { const f = good(); f.videos.parents = [k.year, 'extra']; expect(code(f)).toBe('failed-precondition'); });
  it('refuses a folder outside the tenant', () => { const f = good(); f.year.tenants = ['kring']; expect(code(f)).toBe('failed-precondition'); });
  it('refuses an archived folder', () => { const f = good(); f.root.isArchived = true; expect(code(f)).toBe('failed-precondition'); });
});
