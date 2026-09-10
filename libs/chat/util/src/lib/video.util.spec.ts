import { describe, it, expect } from 'vitest';
import { MatrixMessage } from '@okr/shared-models';

import {
  videoMimeTypeForName,
  isVideoFile,
  isVideoMessage,
  posterTargetSize,
  extractVideoPoster,
  VIDEO_POSTER_MAX_EDGE,
} from './video.util';

function file(name: string, type = ''): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function message(partial: Partial<MatrixMessage>): MatrixMessage {
  return {
    eventId: '$1', roomId: '!r', sender: '@a:h', senderName: 'A',
    body: '', timestamp: 0, type: 'm.file', content: {},
    isRedacted: false, isEdited: false,
    ...partial,
  } as MatrixMessage;
}

describe('videoMimeTypeForName', () => {
  it('maps known video extensions case-insensitively', () => {
    expect(videoMimeTypeForName('clip.mp4')).toBe('video/mp4');
    expect(videoMimeTypeForName('CLIP.MOV')).toBe('video/quicktime');
    expect(videoMimeTypeForName('a.b.webm')).toBe('video/webm');
  });

  it('returns undefined for non-video names', () => {
    expect(videoMimeTypeForName('photo.jpg')).toBeUndefined();
    expect(videoMimeTypeForName('notes.pdf')).toBeUndefined();
    expect(videoMimeTypeForName('mp4')).toBeUndefined();
  });
});

describe('isVideoFile', () => {
  it('trusts a declared mime type', () => {
    expect(isVideoFile(file('whatever', 'video/mp4'))).toBe(true);
    expect(isVideoFile(file('clip.mp4', 'application/pdf'))).toBe(false);
  });

  it('falls back to the extension when the browser reports no type', () => {
    // iOS Files app / iCloud Drive / PWA share sheet all hand over an empty type.
    expect(isVideoFile(file('IMG_0042.MOV'))).toBe(true);
    expect(isVideoFile(file('scan.pdf'))).toBe(false);
  });
});

describe('isVideoMessage', () => {
  it('accepts m.video', () => {
    expect(isVideoMessage(message({ type: 'm.video' }))).toBe(true);
  });

  it('accepts a legacy m.file that carries a video mimetype', () => {
    const legacy = message({ type: 'm.file', body: 'clip.mp4', content: { info: { mimetype: 'video/mp4' } } });
    expect(isVideoMessage(legacy)).toBe(true);
  });

  it('rejects audio/webm — the declared mimetype beats the ambiguous extension', () => {
    const voice = message({ type: 'm.file', body: 'voice.webm', content: { info: { mimetype: 'audio/webm' } } });
    expect(isVideoMessage(voice)).toBe(false);
  });

  it('treats an untyped .webm as video', () => {
    expect(isVideoMessage(message({ type: 'm.file', body: 'clip.webm', content: {} }))).toBe(true);
  });

  it('rejects images and documents', () => {
    expect(isVideoMessage(message({ type: 'm.image', body: 'a.png', content: { info: { mimetype: 'image/png' } } }))).toBe(false);
    expect(isVideoMessage(message({ type: 'm.file', body: 'a.pdf', content: {} }))).toBe(false);
  });
});

describe('posterTargetSize', () => {
  it('scales the longest edge down to the cap', () => {
    expect(posterTargetSize(1920, 1080)).toEqual({ width: VIDEO_POSTER_MAX_EDGE, height: 450 });
    expect(posterTargetSize(1080, 1920)).toEqual({ width: 450, height: VIDEO_POSTER_MAX_EDGE });
  });

  it('never scales up', () => {
    expect(posterTargetSize(320, 240)).toEqual({ width: 320, height: 240 });
  });

  it('returns zero for unusable dimensions', () => {
    // videoWidth is 0 until metadata loads, and NaN for a file the browser cannot decode.
    expect(posterTargetSize(0, 0)).toEqual({ width: 0, height: 0 });
    expect(posterTargetSize(NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('extractVideoPoster', () => {
  it('resolves null instead of throwing when the environment cannot decode', async () => {
    // jsdom has no media pipeline: metadata never arrives. The contract that matters is
    // that a failed poster resolves null so the caller still sends the video.
    await expect(extractVideoPoster(file('clip.mp4', 'video/mp4'), 50)).resolves.toBeNull();
  });
});
