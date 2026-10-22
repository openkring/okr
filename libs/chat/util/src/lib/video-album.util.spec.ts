import { describe, expect, it } from 'vitest';

import { callableErrorCode, isAlbumVideoFile, isOversizeChatVideo, isVideoLimitError, isVideoUploadError, VideoLimitError, VideoUploadError, videoAlbumFallsBackToSynapse } from './video-album.util';

function file(name: string, type = ''): File {
  return new File(['x'], name, { type });
}

describe('isAlbumVideoFile', () => {
  it('accepts mp4, mov and avi, also with an empty File.type', () => {
    expect(isAlbumVideoFile(file('clip.mp4', 'video/mp4'))).toBe(true);
    expect(isAlbumVideoFile(file('IMG_0042.MOV'))).toBe(true);
    expect(isAlbumVideoFile(file('old.avi', 'video/x-msvideo'))).toBe(true);
  });

  it('leaves other videos on the Synapse path', () => {
    expect(isAlbumVideoFile(file('clip.webm', 'video/webm'))).toBe(false);
    expect(isAlbumVideoFile(file('clip.mkv'))).toBe(false);
  });

  it('rejects non-videos even with a video-looking name', () => {
    expect(isAlbumVideoFile(file('notes.mp4.pdf', 'application/pdf'))).toBe(false);
    expect(isAlbumVideoFile(file('photo.jpg', 'image/jpeg'))).toBe(false);
  });
});

describe('isVideoLimitError', () => {
  it('recognises the class and a foreign copy by name', () => {
    expect(isVideoLimitError(new VideoLimitError('size', 300))).toBe(true);
    const foreign = new Error('x');
    foreign.name = 'VideoLimitError';
    expect(isVideoLimitError(foreign)).toBe(true);
    expect(isVideoLimitError(new Error('x'))).toBe(false);
    expect(isVideoLimitError(null)).toBe(false);
  });
});

describe('videoAlbumFallsBackToSynapse', () => {
  it('falls back for an archived/moved album and an unreachable Synapse', () => {
    expect(videoAlbumFallsBackToSynapse({ code: 'functions/failed-precondition' })).toBe(true);
    expect(videoAlbumFallsBackToSynapse({ code: 'functions/unavailable' })).toBe(true);
  });

  it('never falls back for a refusal or an unknown error', () => {
    expect(videoAlbumFallsBackToSynapse({ code: 'functions/permission-denied' })).toBe(false);
    expect(videoAlbumFallsBackToSynapse({ code: 'functions/not-found' })).toBe(false);
    expect(videoAlbumFallsBackToSynapse({ code: 'functions/invalid-argument' })).toBe(false);
    expect(videoAlbumFallsBackToSynapse(new Error('PUT failed'))).toBe(false);
    expect(videoAlbumFallsBackToSynapse(undefined)).toBe(false);
  });
});

describe('VideoUploadError', () => {
  it('carries the status, never a URL, and is recognised by name', () => {
    const err = new VideoUploadError(403);
    expect(err.status).toBe(403);
    expect(err.message).not.toMatch(/https?:/);
    expect(isVideoUploadError(err)).toBe(true);
    expect(isVideoUploadError(new Error('x'))).toBe(false);
  });
});

describe('callableErrorCode', () => {
  it('strips the functions/ prefix and ignores everything else', () => {
    expect(callableErrorCode({ code: 'functions/permission-denied' })).toBe('permission-denied');
    expect(callableErrorCode({ code: 'storage/unauthorized' })).toBeUndefined();
    expect(callableErrorCode(new Error('x'))).toBeUndefined();
    expect(callableErrorCode(null)).toBeUndefined();
  });
});

describe('isOversizeChatVideo', () => {
  const MB = 1024 * 1024;
  const sized = (name: string, size: number, type = 'video/mp4') =>
    ({ name, type, size } as unknown as File);

  it('is true for an album video over 100 MB', () => {
    expect(isOversizeChatVideo(sized('a.mp4', 100 * MB + 1))).toBe(true);
  });

  it('is false at exactly 100 MB, for a non-album video and for a document', () => {
    expect(isOversizeChatVideo(sized('a.mp4', 100 * MB))).toBe(false);
    expect(isOversizeChatVideo(sized('a.webm', 300 * MB, 'video/webm'))).toBe(false);
    expect(isOversizeChatVideo(sized('a.pdf', 300 * MB, 'application/pdf'))).toBe(false);
  });
});
