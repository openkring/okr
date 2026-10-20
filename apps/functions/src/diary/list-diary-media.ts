// apps/functions/src/diary/list-diary-media.ts
import { CallableRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

import { driveThumbnailAtSize } from '@okr/content-diary-util';
import type { DiaryMediaFile, DiaryMediaResult } from '@okr/content-diary-util';
import { DiaryCollection } from '@okr/shared-models';
import { logger } from 'firebase-functions/v2';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { driveFetch, getDriveAccessToken } from './drive-client';
import { isArchiveOwner } from './import-diary';

const REGION = 'europe-west6';

const DIARY_DRIVE_CLIENT_ID = defineSecret('DIARY_DRIVE_CLIENT_ID');
const DIARY_DRIVE_CLIENT_SECRET = defineSecret('DIARY_DRIVE_CLIENT_SECRET');
const DIARY_DRIVE_REFRESH_TOKEN = defineSecret('DIARY_DRIVE_REFRESH_TOKEN');
/** The one person whose Drive the refresh token opens — the same gate as the import callables. */
const DIARY_OWNER_UID = defineSecret('DIARY_OWNER_UID');

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * A Drive file id is `[A-Za-z0-9_-]+`. Anything else is refused before it is interpolated into
 * the Drive query string — a quote would otherwise break out of `'<id>' in parents`.
 */
export function isDriveId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

const byName = (a: DiaryMediaFile, b: DiaryMediaFile) => a.name.localeCompare(b.name);
const isVisualMedia = (f: DiaryMediaFile) => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/');

/**
 * Images and videos (`image/*`, `video/*` — the thumbnail row) and documents (everything else)
 * of one day folder, each sorted by name.
 * The diary's own markdown and any subfolder are dropped — subfolders are archive legacy
 * (spec 1.106 §2.3), the markdown is the entry itself.
 */
export function splitDiaryMedia(files: DiaryMediaFile[]): DiaryMediaResult {
  const media = files.filter(f => f.mimeType !== FOLDER_MIME && !f.name.toLowerCase().endsWith('.md'));
  return {
    images: media.filter(isVisualMedia).sort(byName),
    documents: media.filter(f => !isVisualMedia(f)).sort(byName),
  };
}

/** Thumbnail edge length of a strip tile (2× the 96px tile, for sharp retina rendering). */
export const DIARY_THUMB_PX = 220;
/** Edge length of an image in the full-size slider. */
export const DIARY_LARGE_PX = 1600;
/** Parallel thumbnail downloads per call — a day folder rarely holds more than a few dozen photos. */
const THUMB_CONCURRENCY = 8;

/**
 * Downloads a Drive thumbnail and returns it as a `data:` URL; '' when there is none or it fails.
 * The file is private, so the browser cannot load `thumbnailLink` itself — Drive only answers a
 * credentialed request, and the credentials (the archive owner's refresh token) live here.
 */
export async function fetchDriveThumbnail(token: string, link: string, px: number): Promise<string> {
  if (!link) return '';
  try {
    const response = await fetch(driveThumbnailAtSize(link, px), { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return '';
    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${mimeType};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

/** Runs `fn` over `items` with at most `limit` calls in flight; keeps the order. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * The two gates every diary-media call needs, both required: the caller must be the entry's
 * `authorKey` (the diary is personal), AND the archive owner — the refresh token opens the
 * owner's whole Drive, and `driveFolderId` is a field the author can write, so without the owner
 * gate any signed-in user could read any folder of that Drive through their own diary entry
 * (confused deputy). Returns '' as folder id when the entry has no Drive folder.
 */
async function openDiaryFolder(request: CallableRequest<{ diaryKey?: string }>, name: string): Promise<{ folderId: string; token: string }> {
  checkAppCheckToken(request, name);
  checkAuthentication(request, name);
  if (!isArchiveOwner(request.auth?.uid, DIARY_OWNER_UID.value())) {
    logger.error(`${name}: caller ${request.auth?.uid ?? '(unauthenticated)'} is not the diary archive owner`);
    throw new HttpsError('permission-denied', 'This operation is not available to this account.');
  }
  const diaryKey = request.data?.diaryKey;
  if (!diaryKey) throw new HttpsError('invalid-argument', `${name}: diaryKey is required`);

  const snapshot = await getFirestore().collection(DiaryCollection).doc(diaryKey).get();
  if (!snapshot.exists) throw new HttpsError('not-found', `${name}: diary not found`);
  const diary = snapshot.data() as { authorKey?: string; driveFolderId?: string };
  if (diary.authorKey !== request.auth?.uid) throw new HttpsError('permission-denied', `${name}: not the author`);
  if (!diary.driveFolderId) return { folderId: '', token: '' };
  if (!isDriveId(diary.driveFolderId)) throw new HttpsError('failed-precondition', `${name}: invalid driveFolderId`);

  const token = await getDriveAccessToken(
    DIARY_DRIVE_REFRESH_TOKEN.value(),
    DIARY_DRIVE_CLIENT_ID.value(),
    DIARY_DRIVE_CLIENT_SECRET.value(),
  );
  return { folderId: diary.driveFolderId, token };
}

const MEDIA_OPTIONS = {
  region: REGION,
  enforceAppCheck: true,
  timeoutSeconds: 60,
  memory: '512MiB' as const,
  secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN, DIARY_OWNER_UID],
};

/**
 * The photos and documents of one diary day, read live from its Drive day folder (spec 1.106
 * §2.3), each with its thumbnail inlined as a `data:` URL (the browser cannot read a private
 * file's `thumbnailLink`). Nothing is stored.
 */
export const listDiaryMedia = onCall<{ diaryKey?: string }, Promise<DiaryMediaResult>>(
  MEDIA_OPTIONS,
  async (request) => {
    const { folderId, token } = await openDiaryFolder(request, 'listDiaryMedia');
    if (!folderId) return { images: [], documents: [] };

    const response = await driveFetch(token, '/files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,thumbnailLink,webViewLink)',
      pageSize: '200',
    });
    if (!response.ok) throw new HttpsError('unavailable', `listDiaryMedia: drive list failed: ${response.status}`);
    const json = (await response.json()) as { files?: (Partial<DiaryMediaFile> & { thumbnailLink?: string })[] };
    const raw = json.files ?? [];
    const thumbnails = await mapLimited(raw, THUMB_CONCURRENCY, f => fetchDriveThumbnail(token, f.thumbnailLink ?? '', DIARY_THUMB_PX));
    return splitDiaryMedia(raw.map((f, i) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      thumbnail: thumbnails[i],
      webViewLink: f.webViewLink ?? '',
    })));
  },
);

/**
 * One image of a diary day folder at slider size, as a `data:` URL ('' when Drive has no
 * rendition). The file must sit directly in the entry's own day folder — `fileId` comes from the
 * client and would otherwise open any file of the owner's Drive.
 */
export const getDiaryMediaImage = onCall<{ diaryKey?: string; fileId?: string }, Promise<{ url: string }>>(
  MEDIA_OPTIONS,
  async (request) => {
    const fileId = request.data?.fileId ?? '';
    if (!isDriveId(fileId)) throw new HttpsError('invalid-argument', 'getDiaryMediaImage: invalid fileId');
    const { folderId, token } = await openDiaryFolder(request, 'getDiaryMediaImage');
    if (!folderId) throw new HttpsError('failed-precondition', 'getDiaryMediaImage: diary has no Drive folder');

    const response = await driveFetch(token, `/files/${fileId}`, { fields: 'parents,mimeType,thumbnailLink,trashed' });
    if (!response.ok) throw new HttpsError('not-found', `getDiaryMediaImage: drive get failed: ${response.status}`);
    const file = (await response.json()) as { parents?: string[]; mimeType?: string; thumbnailLink?: string; trashed?: boolean };
    if (file.trashed || !(file.parents ?? []).includes(folderId) || !(file.mimeType ?? '').startsWith('image/')) {
      throw new HttpsError('permission-denied', 'getDiaryMediaImage: not an image of this diary day');
    }
    return { url: await fetchDriveThumbnail(token, file.thumbnailLink ?? '', DIARY_LARGE_PX) };
  },
);
