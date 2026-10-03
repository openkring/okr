import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

import { chatFolderKeys, chatVideoPath, MAX_VIDEO_BYTES, safeVideoFileName, validateChatVideoRequest } from './chat-video.util';
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
