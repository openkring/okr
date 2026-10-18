// apps/functions/src/diary/list-diary-media.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

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

/**
 * Images (`image/*`) and documents (everything else) of one day folder, each sorted by name.
 * The diary's own markdown and any subfolder are dropped — subfolders are archive legacy
 * (spec 1.106 §2.3), the markdown is the entry itself.
 */
export function splitDiaryMedia(files: DiaryMediaFile[]): DiaryMediaResult {
  const media = files.filter(f => f.mimeType !== FOLDER_MIME && !f.name.toLowerCase().endsWith('.md'));
  return {
    images: media.filter(f => f.mimeType.startsWith('image/')).sort(byName),
    documents: media.filter(f => !f.mimeType.startsWith('image/')).sort(byName),
  };
}

/**
 * The photos and documents of one diary day, read live from its Drive day folder (spec 1.106
 * §2.3). Two gates, both needed: the caller must be the entry's `authorKey` (the diary is
 * personal), AND the archive owner — the refresh token opens the owner's whole Drive, and
 * `driveFolderId` is a field the author can write, so without the owner gate any signed-in user
 * could list any folder of that Drive through their own diary entry (confused deputy).
 * Nothing is stored — `thumbnailLink` is a short-lived signed URL and lives in the client's
 * memory only.
 */
export const listDiaryMedia = onCall<{ diaryKey?: string }, Promise<DiaryMediaResult>>(
  {
    region: REGION,
    enforceAppCheck: true,
    timeoutSeconds: 60,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN, DIARY_OWNER_UID],
  },
  async (request) => {
    checkAppCheckToken(request, 'listDiaryMedia');
    checkAuthentication(request, 'listDiaryMedia');
    if (!isArchiveOwner(request.auth?.uid, DIARY_OWNER_UID.value())) {
      logger.error(`listDiaryMedia: caller ${request.auth?.uid ?? '(unauthenticated)'} is not the diary archive owner`);
      throw new HttpsError('permission-denied', 'This operation is not available to this account.');
    }
    const diaryKey = request.data?.diaryKey;
    if (!diaryKey) throw new HttpsError('invalid-argument', 'listDiaryMedia: diaryKey is required');

    const snapshot = await getFirestore().collection(DiaryCollection).doc(diaryKey).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'listDiaryMedia: diary not found');
    const diary = snapshot.data() as { authorKey?: string; driveFolderId?: string };
    if (diary.authorKey !== request.auth?.uid) throw new HttpsError('permission-denied', 'listDiaryMedia: not the author');
    if (!diary.driveFolderId) return { images: [], documents: [] };
    if (!isDriveId(diary.driveFolderId)) throw new HttpsError('failed-precondition', 'listDiaryMedia: invalid driveFolderId');

    const token = await getDriveAccessToken(
      DIARY_DRIVE_REFRESH_TOKEN.value(),
      DIARY_DRIVE_CLIENT_ID.value(),
      DIARY_DRIVE_CLIENT_SECRET.value(),
    );
    const response = await driveFetch(token, '/files', {
      q: `'${diary.driveFolderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,thumbnailLink,webViewLink)',
      pageSize: '200',
    });
    if (!response.ok) throw new HttpsError('unavailable', `listDiaryMedia: drive list failed: ${response.status}`);
    const json = (await response.json()) as { files?: Partial<DiaryMediaFile>[] };
    return splitDiaryMedia((json.files ?? []).map(f => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      thumbnailLink: f.thumbnailLink ?? '',
      webViewLink: f.webViewLink ?? '',
    })));
  },
);
