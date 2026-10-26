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

const REGION = 'europe-west6';

const DIARY_DRIVE_CLIENT_ID = defineSecret('DIARY_DRIVE_CLIENT_ID');
const DIARY_DRIVE_CLIENT_SECRET = defineSecret('DIARY_DRIVE_CLIENT_SECRET');
const DIARY_DRIVE_REFRESH_TOKEN = defineSecret('DIARY_DRIVE_REFRESH_TOKEN');
/** The one person whose Drive the refresh token opens. */
const DIARY_OWNER_UID = defineSecret('DIARY_OWNER_UID');

/**
 * True when `callerUid` is the ONE person this deployment's Drive secrets belong to. The Drive
 * credentials are ours, not the caller's, so `checkAdminRole` (global, not tenant-scoped) is not
 * enough on its own. An unset secret resolves to '', which is rejected: a misconfigured deploy
 * denies everyone rather than letting everyone through.
 */
export function isArchiveOwner(callerUid: string | undefined, ownerUid: string): boolean {
  return callerUid !== undefined && callerUid !== '' && callerUid === ownerUid;
}

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

/** A Drive folder as the day-folder search returns it. */
export interface DriveFolderCandidate {
  id: string;
  name: string;
  parents?: string[];
}

/**
 * The folders that can be the day folder of `date` (yyyyMMdd): the name STARTS with the date
 * (`20260820do`, `20260820doToteFische`) and the id is a valid Drive id. The Drive search is a
 * `name contains`, so a folder that only mentions the date further in is dropped here.
 */
export function dayFolderMatches(date: string, candidates: DriveFolderCandidate[]): DriveFolderCandidate[] {
  return candidates.filter(c => (c.name ?? '').startsWith(date) && isDriveId(c.id ?? ''));
}

/**
 * The day folder of `date` among the search hits, '' when there is none or it stays ambiguous.
 * One prefix match wins outright. Several are narrowed to those whose parent is the month folder
 * (`MM`, spec 1.106: archive → 202x → yyyy → MM → day); `parentNames` maps a parent id to its name.
 */
export function pickDayFolder(date: string, candidates: DriveFolderCandidate[], parentNames: Record<string, string>): string {
  const matches = dayFolderMatches(date, candidates);
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) return '';
  const month = date.slice(4, 6);
  const inMonth = matches.filter(c => (c.parents ?? []).some(p => parentNames[p] === month));
  return inMonth.length === 1 ? inMonth[0].id : '';
}

/**
 * Looks the day folder of `date` up in Drive by name ('' when not found or ambiguous). The date is
 * checked to be 8 digits before it goes into the query.
 */
async function findDayFolder(token: string, date: string, name: string): Promise<string> {
  if (!/^\d{8}$/.test(date)) return '';
  const response = await driveFetch(token, '/files', {
    q: `mimeType = '${FOLDER_MIME}' and name contains '${date}' and trashed = false`,
    fields: 'files(id,name,parents)',
    pageSize: '50',
  });
  if (!response.ok) throw new HttpsError('unavailable', `${name}: drive folder search failed: ${response.status}`);
  const files = ((await response.json()) as { files?: DriveFolderCandidate[] }).files ?? [];
  const matches = dayFolderMatches(date, files);
  const parentNames: Record<string, string> = {};
  if (matches.length > 1) {
    const parentIds = [...new Set(matches.flatMap(m => m.parents ?? []))].filter(isDriveId);
    await Promise.all(parentIds.map(async id => {
      const parent = await driveFetch(token, `/files/${id}`, { fields: 'name' });
      if (parent.ok) parentNames[id] = ((await parent.json()) as { name?: string }).name ?? '';
    }));
  }
  return pickDayFolder(date, files, parentNames);
}

/**
 * The two gates every diary-media call needs, both required: the caller must be the entry's
 * `authorKey` (the diary is personal), AND the archive owner — the refresh token opens the
 * owner's whole Drive, and `driveFolderId` is a field the author can write, so without the owner
 * gate any signed-in user could read any folder of that Drive through their own diary entry
 * (confused deputy). Returns '' as folder id when the entry has no Drive folder.
 *
 * A day entry created in the app has `driveFolderId: ''` — its day folder is looked up by date
 * and the id written back, so the next read needs no search (the id survives folder renames).
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

  const ref = getFirestore().collection(DiaryCollection).doc(diaryKey);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', `${name}: diary not found`);
  const diary = snapshot.data() as { authorKey?: string; driveFolderId?: string; scope?: string; date?: string };
  if (diary.authorKey !== request.auth?.uid) throw new HttpsError('permission-denied', `${name}: not the author`);

  const canLookUp = !diary.driveFolderId && diary.scope === 'day' && /^\d{8}$/.test(diary.date ?? '');
  if (!diary.driveFolderId && !canLookUp) return { folderId: '', token: '' };
  if (diary.driveFolderId && !isDriveId(diary.driveFolderId)) throw new HttpsError('failed-precondition', `${name}: invalid driveFolderId`);

  const token = await getDriveAccessToken(
    DIARY_DRIVE_REFRESH_TOKEN.value(),
    DIARY_DRIVE_CLIENT_ID.value(),
    DIARY_DRIVE_CLIENT_SECRET.value(),
  );
  if (diary.driveFolderId) return { folderId: diary.driveFolderId, token };

  const date = diary.date ?? '';
  const found = await findDayFolder(token, date, name);
  if (!found) {
    logger.info(`${name}: no unique Drive day folder for diary ${diaryKey} (${date})`);
    return { folderId: '', token: '' };
  }
  await ref.update({ driveFolderId: found });
  logger.info(`${name}: resolved Drive day folder ${found} for diary ${diaryKey} (${date})`);
  return { folderId: found, token };
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
    const media = splitDiaryMedia(raw.map((f, i) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      thumbnail: thumbnails[i],
      webViewLink: f.webViewLink ?? '',
    })));
    return { ...media, folderId };
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
