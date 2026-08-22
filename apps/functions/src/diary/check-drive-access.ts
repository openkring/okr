// apps/functions/src/diary/check-drive-access.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';
import { driveFetch, getDriveAccessToken } from './drive-client';

const REGION = 'europe-west6';

const DIARY_DRIVE_CLIENT_ID = defineSecret('DIARY_DRIVE_CLIENT_ID');
const DIARY_DRIVE_CLIENT_SECRET = defineSecret('DIARY_DRIVE_CLIENT_SECRET');
const DIARY_DRIVE_REFRESH_TOKEN = defineSecret('DIARY_DRIVE_REFRESH_TOKEN');

/**
 * Proves the deployed function can reach the diary archive in Drive. Reads only: it reports the
 * signed-in account and counts the diary files it can see. Writes nothing, and returns no file
 * content — the archive is personal data.
 */
export const checkDriveAccess = onCall(
  {
    region: REGION,
    enforceAppCheck: true,
    timeoutSeconds: 120,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN],
  },
  async (request) => {
    checkAppCheckToken(request, 'checkDriveAccess');
    checkAuthentication(request, 'checkDriveAccess');
    await checkAdminRole(request, 'checkDriveAccess');

    const token = await getDriveAccessToken(
      DIARY_DRIVE_REFRESH_TOKEN.value(),
      DIARY_DRIVE_CLIENT_ID.value(),
      DIARY_DRIVE_CLIENT_SECRET.value(),
    );

    const about = await driveFetch(token, '/about', { fields: 'user(emailAddress),storageQuota(limit,usage)' });
    if (!about.ok) {
      throw new HttpsError('permission-denied', `drive about failed: ${about.status}`);
    }
    const aboutJson = (await about.json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string };
    };

    // one page is enough to prove access; the import pages through all of them
    const list = await driveFetch(token, '/files', {
      q: "name contains 'diary' and trashed = false",
      fields: 'nextPageToken,files(id,name,parents)',
      pageSize: '100',
    });
    if (!list.ok) {
      throw new HttpsError('permission-denied', `drive list failed: ${list.status}`);
    }
    const listJson = (await list.json()) as { files?: { name: string }[]; nextPageToken?: string };

    const result = {
      account: aboutJson.user?.emailAddress ?? '',
      quotaLimit: aboutJson.storageQuota?.limit ?? '',
      quotaUsage: aboutJson.storageQuota?.usage ?? '',
      firstPageFiles: listJson.files?.length ?? 0,
      hasMorePages: Boolean(listJson.nextPageToken),
    };
    logger.info('checkDriveAccess: ok', result);
    return result;
  },
);
