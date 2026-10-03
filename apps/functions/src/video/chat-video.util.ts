import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

import { isAlbumVideoObjectPath } from './video-sign.util';

/** Mirrors MAX_VIDEO_BYTES in @okr/shared-util-core (see the "drei Stellen" comment there) and
 *  `videoSizeOk()` in the storage rules. Bound into the signed upload URL as
 *  `x-goog-content-length-range`, so GCS itself refuses a larger body. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi'];
const MAX_FILE_NAME = 120;
const MAX_ID_LENGTH = 255;

export interface ChatVideoRequest {
  roomId: string;
  fileName: string;
  size: number;
  mimeType: string;
  roomName: string;
}

/**
 * Deterministic folder keys of a room's chat album (spec 1.82 §8): two members sending a video at
 * the same moment must land in the same three folders. The hash keeps the room id (which contains
 * `!` and `:`) out of the document id and makes the key unguessable from the room name.
 */
export function chatFolderKeys(tenantId: string, roomId: string, year: string): { root: string; year: string; videos: string } {
  const root = 'chat_' + createHash('sha256').update(`${tenantId}|${roomId}`).digest('hex').slice(0, 20);
  const yearKey = `${root}_${year}`;
  return { root, year: yearKey, videos: `${yearKey}_videos` };
}

/**
 * A file name safe for one path segment: `/`, `\` and control characters become `_`, leading dots
 * are dropped, the extension is kept. An empty base falls back to `video`.
 */
export function safeVideoFileName(name: string): string {
  const raw = String(name ?? '');
  const ext = /\.[A-Za-z0-9]+$/.exec(raw)?.[0] ?? '';
  const base = raw
    .slice(0, raw.length - ext.length)
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f\u007f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, MAX_FILE_NAME - ext.length);
  return (base || 'video') + ext;
}

/** `tenant/<tid>/folder/<videosKey>/album/<random>/<safe file name>` — the private-bucket path of a chat video. */
export function chatVideoPath(tenantId: string, videosKey: string, fileName: string, random: string): string {
  const path = `tenant/${tenantId}/folder/${videosKey}/album/${random}/${safeVideoFileName(fileName)}`;
  if (!isAlbumVideoObjectPath(path, tenantId)) {
    throw new HttpsError('invalid-argument', 'Unsupported video file name.');
  }
  return path;
}

function fail(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

/** Validates the `prepareChatVideoUpload` payload or throws `invalid-argument`. */
export function validateChatVideoRequest(data: unknown): ChatVideoRequest {
  if (typeof data !== 'object' || data === null) fail('Missing request data.');
  const d = data as Record<string, unknown>;
  const { roomId, fileName, size } = d;
  if (typeof roomId !== 'string' || !roomId.startsWith('!') || roomId.length > MAX_ID_LENGTH || roomId.includes('/')) {
    fail('Invalid roomId.');
  }
  if (typeof fileName !== 'string' || fileName.trim().length === 0 || fileName.length > MAX_ID_LENGTH) {
    fail('Invalid fileName.');
  }
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  if (!VIDEO_EXTENSIONS.includes(ext)) fail('Unsupported video type.');
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) {
    fail('Invalid size.');
  }
  const mimeType = typeof d['mimeType'] === 'string' ? d['mimeType'].slice(0, 100) : '';
  const roomName = typeof d['roomName'] === 'string' ? d['roomName'] : '';
  return { roomId, fileName, size, mimeType, roomName };
}
