import { isVideoFile } from './video.util';

/**
 * Chat videos go into the room's album (spec 1.82 §8) — but only the containers the album
 * accepts: the private-bucket Storage rule and `prepareChatVideoUpload` admit mp4, mov and avi.
 * Any other video (webm, mkv, 3gp …) keeps the old Synapse attachment path, because the
 * callable would refuse it with `invalid-argument` and the video would never reach the room.
 */
const ALBUM_VIDEO_NAME = /\.(mp4|mov|avi)$/i;

/** True for a video the room album can take (mp4/mov/avi; File.type may be empty). */
export function isAlbumVideoFile(file: File): boolean {
  return isVideoFile(file) && ALBUM_VIDEO_NAME.test(file.name);
}

/**
 * Thrown before anything goes out when a chat video breaks the album limits (2 min, 200 MB).
 * A distinct type so the store can show the size/duration toast instead of a generic failure.
 */
export class VideoLimitError extends Error {
  constructor(
    public readonly reason: 'size' | 'duration',
    /** Bytes for 'size', seconds for 'duration'. */
    public readonly actual: number
  ) {
    super(`video exceeds the album ${reason} limit (${actual})`);
    this.name = 'VideoLimitError';
    Object.setPrototypeOf(this, VideoLimitError.prototype);
  }
}

/** True if the given value is a VideoLimitError, safe across bundle boundaries. */
export function isVideoLimitError(error: unknown): error is VideoLimitError {
  return error instanceof VideoLimitError
    || (error as Error | null)?.name === 'VideoLimitError';
}

/**
 * The signed PUT into the private bucket failed. `status` is the HTTP status, 0 for a network
 * error or an abort. Carries no URL: the signed URL is a write credential and must never be logged.
 */
export class VideoUploadError extends Error {
  constructor(public readonly status: number) {
    super(status ? `video upload failed with HTTP ${status}` : 'video upload failed (network or aborted)');
    this.name = 'VideoUploadError';
    Object.setPrototypeOf(this, VideoUploadError.prototype);
  }
}

/** True if the given value is a VideoUploadError, safe across bundle boundaries. */
export function isVideoUploadError(error: unknown): error is VideoUploadError {
  return error instanceof VideoUploadError
    || (error as Error | null)?.name === 'VideoUploadError';
}

/** The `functions/<code>` of a callable error, else undefined. */
export function callableErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('functions/') ? code.slice('functions/'.length) : undefined;
}

/**
 * Whether a failed `prepareChatVideoUpload` should fall back to the Synapse attachment path.
 *
 * `failed-precondition` (the room album was archived or moved) and `unavailable` (Synapse could
 * not be asked about the membership) are not the sender's fault: the video still reaches the
 * room, just not the album. `permission-denied`, `not-found` and `invalid-argument` are real
 * refusals — falling back would bypass exactly the check that refused.
 */
export function videoAlbumFallsBackToSynapse(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'functions/failed-precondition' || code === 'functions/unavailable';
}
