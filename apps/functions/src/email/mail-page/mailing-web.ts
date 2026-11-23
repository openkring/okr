// apps/functions/src/email/mail-page/mailing-web.ts
//
// The web version of a Versand (spec 1.172 §7.5).
//
// `mailingWeb` (public, no login): serves the server-rendered snapshot `mailingWeb/{token}` behind the mail's
// «Im Browser ansehen» link. The link is this function's own URL with the token as `t` (as the answer links,
// no app-domain rewrite). The 128-bit token is the only capability; the snapshot carries no personal values
// (no variables, no answer or unsubscribe link). GET only, never writes, no-store, no-referrer, and a CSP
// under which no script runs: the snapshot contains the tenant-editable email layout.
//
// `setMailingWebVersion` (callable): turns a web version off — deletes the snapshot and the mailing's
// `webToken` in one batch. Who may: privileged / admin / memberAdmin of the mailing's tenant, the readers of
// `mailings` (firestore.rules). Turning one on again is not supported (v1).

import { CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { MailingWebCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { neutralizeMeta } from '../mailing-answer.logic';
import { isElevated } from '../mailing-recipients';
import { errorCodeOf, WEB_VERSION_HEADERS, WEB_VERSION_NOT_FOUND_PAGE, webTokenFromRequest } from './web-version.logic';

const REGION = 'europe-west6';
/** `MailingCollection` of mailing.ts, not imported from there: that module loads the whole send pipeline. */
const MAILINGS = 'mailings';

export const mailingWeb = onRequest(
  { region: REGION, cors: false, maxInstances: 10 },
  async (req, res) => {
    const CF_NAME = 'mailingWeb';
    // set before any branch: the 200, 404, 405 and 500 answers all carry them
    for (const [name, value] of Object.entries(WEB_VERSION_HEADERS)) res.set(name, value);
    if (req.method !== 'GET') { res.set('Allow', 'GET'); res.status(405).send(''); return; }

    try {
      const token = webTokenFromRequest(req.path, req.query as Record<string, unknown>);
      const snap = token ? await getFirestore().collection(MailingWebCollection).doc(token).get() : undefined;
      const html = snap?.exists ? snap.get('html') : undefined;
      if (typeof html !== 'string' || !html) { res.status(404).send(WEB_VERSION_NOT_FOUND_PAGE); return; }
      // The layout is tenant-editable: a meta refresh would navigate away despite the CSP, so every meta goes.
      res.status(200).send(neutralizeMeta(html));
    } catch (err) {
      // Never log the token: it is the capability, and a Firestore error can carry the doc path.
      logger.error(`${CF_NAME}: failed`, { code: errorCodeOf(err) });
      if (!res.headersSent) res.status(500).send(WEB_VERSION_NOT_FOUND_PAGE);
    }
  },
);

export interface SetMailingWebVersionRequest {
  tenantId: string;
  mailingKey: string;
  /** Only `false` in v1. */
  on: boolean;
}

export const setMailingWebVersion = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<SetMailingWebVersionRequest>): Promise<{ ok: true }> => {
    const CF_NAME = 'setMailingWebVersion';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { tenantId, mailingKey, on } = request.data ?? {};
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (typeof mailingKey !== 'string' || !mailingKey || mailingKey.includes('/')) throw new HttpsError('invalid-argument', 'mailingKey is required.');
    if (on !== false) throw new HttpsError('invalid-argument', 'A web version can only be turned off.');

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const caller = (await db.collection('users').doc(uid).get()).data();
    if (!isElevated(caller?.['roles']) || !((caller?.['tenants'] ?? []) as string[]).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'This operation requires the memberAdmin or privileged role.');
    }

    const ref = db.collection(MAILINGS).doc(mailingKey);
    const mailing = (await ref.get()).data();
    // a mailing of another tenant answers as a missing one: no hint that it exists
    if (!mailing || !((mailing['tenants'] ?? []) as string[]).includes(tenantId)) throw new HttpsError('not-found', 'No such Versand.');

    const token = mailing['webToken'];
    if (typeof token !== 'string' || !token) return { ok: true }; // already off
    const batch = db.batch();
    batch.delete(db.collection(MailingWebCollection).doc(token));
    batch.update(ref, { webToken: FieldValue.delete() });
    await batch.commit();
    logger.info(`${CF_NAME}: web version turned off (tenant ${tenantId})`);
    return { ok: true };
  },
);
