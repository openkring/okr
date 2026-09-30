import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { isDiaryCalendarDay } from '@okr/content-diary-util';
import { UserCollection } from '@okr/shared-models';
import { checkAppCheckToken } from '@okr/shared-util-functions';

import { appendToDiary, DiaryLineResult, readDiaryTenantId } from './append-to-diary';

export const DIARY_LINE_MAX = 500;

export interface DiaryLineRequest {
  /** the tenant of the app the line comes from; its app-config names the diary tenant */
  tenantId: string;
  /** DateFormat.StoreDate of the day the line belongs to */
  date: string;
  line: string;
}

/** Throws on a malformed request; returns the trimmed line. Pure. */
export function validateDiaryLineRequest(data: Partial<DiaryLineRequest> | undefined): string {
  if (!data || typeof data.tenantId !== 'string' || data.tenantId === '') {
    throw new HttpsError('invalid-argument', 'tenantId required');
  }
  if (typeof data.date !== 'string' || !isDiaryCalendarDay(data.date)) {
    throw new HttpsError('invalid-argument', 'date must be a calendar day');
  }
  const line = typeof data.line === 'string' ? data.line.trim() : '';
  if (line === '' || line.length > DIARY_LINE_MAX) {
    throw new HttpsError('invalid-argument', `line must be 1..${DIARY_LINE_MAX} characters`);
  }
  return line;
}

/**
 * Appends one line to the `events` list of the CALLER's own diary entry for a day, in the tenant
 * that `app-config/{tenantId}.diaryTenantId` names (spec 1.67 Jasstafel: a finished game's result).
 * The author is always `request.auth.uid`, never a parameter, and the caller must belong to both
 * the app tenant and the diary tenant — otherwise they could not read the entry back anyway.
 * A callable rather than a client write because the diary tenant is usually not the app's tenant.
 */
export const recordDiaryLine = onCall<DiaryLineRequest, Promise<{ status: DiaryLineResult }>>(
  { region: 'europe-west6', memory: '256MiB', timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'recordDiaryLine');
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
    const line = validateDiaryLineRequest(request.data);
    const { tenantId, date } = request.data;

    const db = getFirestore();
    const diaryTenantId = await readDiaryTenantId(db, tenantId);
    if (diaryTenantId === '') throw new HttpsError('failed-precondition', 'no diary tenant configured');

    const user = await db.collection(UserCollection).doc(uid).get();
    const tenants: unknown = user.data()?.['tenants'];
    if (!Array.isArray(tenants) || !tenants.includes(tenantId) || !tenants.includes(diaryTenantId)) {
      throw new HttpsError('permission-denied', 'not a member of the diary tenant');
    }

    const status = await appendToDiary(db, diaryTenantId, uid, date, 'events', line, 'add');
    logger.info(`recordDiaryLine: ${status} tenant=${tenantId} diaryTenant=${diaryTenantId} date=${date}`);
    return { status };
  },
);
