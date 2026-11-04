import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { gainedSource } from '@okr/content-diary-util';
import { DIARY_SOURCES, DiaryConsent, DiaryPull, DiarySource, DiarySourceModel, DiarySourcesCollection, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken } from '@okr/shared-util-functions';

import { sweepRecordings } from '../trip/recording-diary';
import { liveUsers, readPullUsers, type PullUser } from './diary-pull';

export interface SetDiaryConsentRequest {
  /** the Tagebuch-App that asked */
  diaryTenantId: string;
  /** the rows the person allows; [] revokes */
  sources: DiarySource[];
}

export interface SetDiaryConsentResult {
  /** the rows now allowed */
  sources: DiarySource[];
  /** recordings the one sweep added to the diary */
  swept: number;
}

/** Throws on a malformed request. Pure. */
export function validateConsentRequest(data: Partial<SetDiaryConsentRequest> | undefined): SetDiaryConsentRequest {
  if (!data || typeof data.diaryTenantId !== 'string' || data.diaryTenantId === '') {
    throw new HttpsError('invalid-argument', 'diaryTenantId required');
  }
  if (!Array.isArray(data.sources)) throw new HttpsError('invalid-argument', 'sources required');
  if (data.sources.some((s) => !(DIARY_SOURCES as readonly string[]).includes(s))) {
    throw new HttpsError('invalid-argument', 'unknown source');
  }
  return { diaryTenantId: data.diaryTenantId, sources: data.sources };
}

/**
 * Whose request a consent answers: the one live user in the diary tenant, when the caller is the one live user here.
 * With two in either tenant nobody can tell, the same gate as `selectDiaryPulls`. Pure.
 */
export function consentDiaryUid(live: PullUser[], callerUid: string, ownTenant: string, diaryTenantId: string): string | undefined {
  const inTenant = (tenantId: string) => live.filter((u) => (u.tenants ?? []).includes(tenantId));
  const here = inTenant(ownTenant);
  const there = inTenant(diaryTenantId);
  return here.length === 1 && here[0].id === callerUid && there.length === 1 ? there[0].id : undefined;
}

/**
 * The consent after this call (spec 1.77 §12.4): only rows the diary asked for are stored, so a consent never gets ahead
 * of its request; [] removes the entry and always works, the diary may be gone. `sweep` = the consent newly gained
 * `tracker` (D-R8). Pure.
 */
export function decideConsent(input: {
  current: DiaryConsent[] | undefined;
  diaryTenantId: string;
  diaryUid: string;
  sources: DiarySource[];
  pull: DiaryPull | undefined;
}): { next: DiaryConsent[]; sources: DiarySource[]; sweep: boolean } {
  const { current, diaryTenantId, diaryUid, sources, pull } = input;
  if (sources.length > 0 && !pull) throw new HttpsError('failed-precondition', 'no request from that diary');
  const stored = (pull?.sources ?? []).filter((s) => sources.includes(s));
  const others = (current ?? []).filter((c) => c.tenantId !== diaryTenantId);
  const next = stored.length > 0 ? [...others, { tenantId: diaryTenantId, uid: diaryUid, sources: stored }] : others;
  return { next, sources: stored, sweep: gainedSource(current, next, diaryTenantId, 'tracker') };
}

/**
 * The only writer of `users.diaryConsents` (D-R10): the signed-in person, on their own user doc in the source app. When
 * the consent newly gains `tracker` it sweeps once (§12.9), so the rule forbids the field to every client. The consent
 * is written first: a failed sweep leaves a valid consent and is logged.
 */
export const setDiaryConsent = onCall<SetDiaryConsentRequest, Promise<SetDiaryConsentResult>>(
  { region: 'europe-west6', memory: '256MiB', timeoutSeconds: 120, enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'setDiaryConsent';
    checkAppCheckToken(request, CF_NAME);
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
    const { diaryTenantId, sources } = validateConsentRequest(request.data);

    const db = getFirestore();
    const userRef = db.collection(UserCollection).doc(uid);
    const user = (await userRef.get()).data() ?? {};
    const personKey = (user['personKey'] as string | undefined) ?? '';
    const ownTenant = (user['tenants'] as string[] | undefined)?.[0] ?? '';
    if (!personKey || !ownTenant) throw new HttpsError('failed-precondition', 'no person');
    if (diaryTenantId === ownTenant) throw new HttpsError('invalid-argument', 'the diary app needs no confirmation');

    // a revocation looks at nothing: it must work whatever state the diary and Auth are in
    const diaryUid = sources.length > 0 ? consentDiaryUid(await liveUsers(await readPullUsers(db, personKey)), uid, ownTenant, diaryTenantId) : undefined;
    const doc = diaryUid ? (await db.collection(DiarySourcesCollection).doc(diaryUid).get()).data() as DiarySourceModel | undefined : undefined;
    const decision = decideConsent({
      current: user['diaryConsents'] as DiaryConsent[] | undefined,
      diaryTenantId, diaryUid: diaryUid ?? '', sources,
      pull: (doc?.pulls ?? []).find((p) => p.tenantId === ownTenant),
    });
    await userRef.update({ diaryConsents: decision.next });

    let swept = 0;
    if (decision.sweep) {
      try {
        swept = await sweepRecordings(db, { personKey, sourceTenant: ownTenant, diaryTenant: diaryTenantId, from: doc?.from ?? '', to: doc?.to ?? '' });
      } catch (error) {
        logger.error(`${CF_NAME}: sweep failed uid=${uid} diary=${diaryTenantId}`, error);
      }
    }
    logger.info(`${CF_NAME}: uid=${uid} diary=${diaryTenantId} sources=[${decision.sources.join(', ')}] swept=${swept}`);
    return { sources: decision.sources, swept };
  },
);
