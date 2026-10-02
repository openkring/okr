import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { isDiaryCalendarDay } from '@okr/content-diary-util';
import { DIARY_SOURCES, DiarySource, DiaryTarget, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken } from '@okr/shared-util-functions';

import { sendToDiaries, summariseDiaryResults, type DiarySummary } from './diary-transfer';

export const DIARY_LINE_MAX = 500;

export interface DiaryLineRequest {
  /** the tenant of the app the line comes from (logging; the routing is on the caller's user doc) */
  tenantId: string;
  /** which kind of information this is; missing = 'jasstafel' (clients before spec 1.77) */
  source?: DiarySource;
  /** DateFormat.StoreDate of the day the line belongs to */
  date: string;
  line: string;
}

/** Throws on a malformed request; returns the trimmed line and the effective source. Pure. */
export function validateDiaryLineRequest(data: Partial<DiaryLineRequest> | undefined): { line: string; source: DiarySource } {
  if (!data || typeof data.tenantId !== 'string' || data.tenantId === '') {
    throw new HttpsError('invalid-argument', 'tenantId required');
  }
  if (typeof data.date !== 'string' || !isDiaryCalendarDay(data.date)) {
    throw new HttpsError('invalid-argument', 'date must be a calendar day');
  }
  const source = data.source ?? 'jasstafel';
  if (!(DIARY_SOURCES as readonly string[]).includes(source)) {
    throw new HttpsError('invalid-argument', 'unknown source');
  }
  const line = typeof data.line === 'string' ? data.line.trim() : '';
  if (line === '' || line.length > DIARY_LINE_MAX) {
    throw new HttpsError('invalid-argument', `line must be 1..${DIARY_LINE_MAX} characters`);
  }
  return { line, source };
}

/**
 * Old clients (no `source` in the request) treat any status but 'skipped-final' as success, so a
 * 'skipped-no-target' would show them a false "ok". Reject it for them; they map it to "denied".
 */
export function rejectsForOldClient(hadSource: boolean, status: DiarySummary): boolean {
  return !hadSource && status === 'skipped-no-target';
}

/**
 * Appends one line to the `events` of the caller's day entry in every diary their user doc in
 * THIS app routes `source` to (`users/{uid}.diaryTargets`, spec 1.77 §6). The author in each diary
 * is the caller's person's user in that diary tenant — never `request.auth.uid` from another
 * tenant. No matching target is not an error: `{ status: 'skipped-no-target' }` — except for old
 * clients without `source`, which get `failed-precondition` (see `rejectsForOldClient`).
 */
export const recordDiaryLine = onCall<DiaryLineRequest, Promise<{ status: DiarySummary; written: string[] }>>(
  { region: 'europe-west6', memory: '256MiB', timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    checkAppCheckToken(request, 'recordDiaryLine');
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
    const { line, source } = validateDiaryLineRequest(request.data);
    const { tenantId, date } = request.data;

    const db = getFirestore();
    const user = (await db.collection(UserCollection).doc(uid).get()).data() ?? {};
    const results = await sendToDiaries(db, {
      personKey: (user['personKey'] as string | undefined) ?? '',
      targets: user['diaryTargets'] as DiaryTarget[] | undefined,
      source, date, field: 'events', line, mode: 'add',
    });
    const status = summariseDiaryResults(results);
    if (rejectsForOldClient(request.data.source !== undefined, status)) {
      throw new HttpsError('failed-precondition', 'no diary target');
    }
    const written = Object.entries(results).filter(([, r]) => r === 'written').map(([t]) => t);
    logger.info(`recordDiaryLine: ${status} tenant=${tenantId} source=${source} date=${date} results=${JSON.stringify(results)}`);
    return { status, written };
  },
);
