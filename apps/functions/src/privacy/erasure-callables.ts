import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

import { AppConfigCollection, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

import { isValidProvider, sendEmailViaProvider } from '../auth/email-transport';
import { getAppEmailConfig } from '../auth/email-templates';
import { buildSubjectCtx } from './export-my-data';
import { SUBJECT_DATA_MAP } from './subject-data-map';
import { buildPreview, firestoreDocFetcher } from './erasure-preview';
import type { ErasurePreview } from './erasure-preview';
import { executeErasure, firestoreErasureOps } from './erasure-execute';
import type { ErasureResult } from './erasure-execute';
import type { SubjectCtx } from './types';

/**
 * The two erasure callables (5B, task C3).
 *
 * Both derive the subject from `request.auth.uid` and take **no parameter that could
 * name another subject** — same structural guarantee as `exportMyData`. An
 * admin-initiated on-behalf-of erasure is an explicit non-goal here; it is §8 of the
 * membership-lifecycle spec.
 *
 * `eraseMyData` never trusts the client's copy of the report: it rebuilds the preview
 * server-side and compares tokens, so a confirmation given for one situation cannot
 * execute a different one.
 */

const REGION = 'europe-west6';

/** Secrets `eraseMyData` needs: the pseudonym salt, plus whatever the mail transport
 * uses for the admin notification. */
const ERASURE_SECRETS = [
  'ERASURE_SALT',
  'MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD',
  'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS',
];

/**
 * The client-facing result. **Deliberately narrower than `ErasureResult`**: forwarding
 * `personDeleted`/`authUserDeleted` would tell the caller whether their person record
 * survived, and it can only survive because another tenancy holds it (D-P5-2).
 */
export interface EraseMyDataResponse {
  readonly executedAt: string;
  readonly pseudonym: string;
  readonly counts: Record<string, number>;
}

export function toEraseResponse(result: ErasureResult): EraseMyDataResponse {
  return { executedAt: result.executedAt, pseudonym: result.pseudonym, counts: result.counts };
}

/**
 * Gate between the fresh server-side preview and the client's confirmation. Throws the
 * German message the modal renders verbatim.
 */
export function assertExecutable(fresh: ErasurePreview, providedToken: string | undefined): void {
  if (!providedToken || fresh.previewToken !== providedToken) {
    throw new HttpsError('failed-precondition',
      'Die Übersicht hat sich geändert. Bitte prüfen Sie sie erneut.');
  }
  if (fresh.blockers.length > 0) {
    throw new HttpsError('failed-precondition', 'Es bestehen noch offene Punkte.');
  }
}

/** Admins of this tenant other than the caller. `0` makes the preview block. */
export function countOtherAdmins(users: readonly DocumentSnapshot[], uid: string): number {
  return users.filter((u) => u.id !== uid && u.get('roles.admin') === true).length;
}

/**
 * Reads the tenant's users and counts the other admins in memory rather than querying
 * `roles.admin == true`. The query would need a composite index on
 * (tenants, roles.admin) for a callable that runs a handful of times per year, over a
 * collection with a few hundred documents per tenant.
 */
async function loadOtherAdminCount(tenantId: string, uid: string): Promise<number> {
  const snapshot = await getFirestore().collection(UserCollection)
    .where('tenants', 'array-contains', tenantId).get();
  return countOtherAdmins(snapshot.docs, uid);
}

async function freshPreview(ctx: SubjectCtx): Promise<ErasurePreview> {
  const otherAdmins = await loadOtherAdminCount(ctx.tenantId, ctx.uid);
  return buildPreview(ctx, SUBJECT_DATA_MAP, firestoreDocFetcher, otherAdmins);
}

/**
 * The tenant admin's "an erasure happened" notice.
 *
 * Takes the tenant name and the timestamp and nothing else — **not** the subject, not
 * even the pseudonym, which is a stable handle back into the anonymized accounting
 * records. A notification that re-identifies the person undoes the erasure it reports.
 */
export function renderAdminNotification(tenantName: string, executedAt: string): { subject: string; html: string } {
  const when = convertDateFormatToString(executedAt, DateFormat.StoreDateTime, DateFormat.ViewDate, false);
  return {
    subject: 'Datenlöschung durchgeführt',
    html: [
      '<p>Ein Mitglied hat sein Recht auf Löschung ausgeübt.</p>',
      `<p>Die Löschung wurde am ${when} für ${tenantName} ausgeführt.</p>`,
      '<p>Die buchhalterischen Unterlagen wurden nicht gelöscht, sondern pseudonymisiert: ',
      'Beträge, Daten und Belegverweise bleiben vollständig erhalten, die Namensfelder ',
      'und die Verknüpfung zur Person wurden überschrieben (gesetzliche Aufbewahrungspflicht, ',
      'OR Art. 958f).</p>',
      '<p>Aus Datenschutzgründen nennt diese Meldung die betroffene Person nicht.</p>',
    ].join(''),
  };
}

/** Best effort: the erasure has already happened when this runs, so a failed mail must
 * never turn a completed erasure into an error the member sees. */
async function notifyTenantAdmin(tenantId: string, executedAt: string): Promise<void> {
  try {
    const configSnap = await getFirestore().collection(AppConfigCollection).doc(tenantId).get();
    const config = configSnap.data();
    const to = String(config?.['dpoEmail'] ?? '') || String(config?.['opEmail'] ?? '');
    if (to === '') {
      logger.warn(`eraseMyData: tenant ${tenantId} has no dpoEmail/opEmail — no admin notification sent.`);
      return;
    }
    const provider = String(config?.['emailProvider'] ?? 'mailgun_smtp');
    if (!isValidProvider(provider)) {
      logger.warn(`eraseMyData: tenant ${tenantId} declares an unknown email provider — no notification sent.`);
      return;
    }
    const { appName, from } = await getAppEmailConfig(tenantId);
    const { subject, html } = renderAdminNotification(appName, executedAt);
    await sendEmailViaProvider(provider, { from, to: [to], subject, html });
  } catch (err) {
    logger.warn(`eraseMyData: admin notification failed: ${String(err)}`);
  }
}

async function subjectCtxOf(uid: string): Promise<SubjectCtx> {
  const userSnap = await getFirestore().collection(UserCollection).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'No user document for the caller.');
  return buildSubjectCtx(uid, userSnap.data());
}

/** The honest four-plus-one-section preflight report for the CALLER'S OWN data. */
export const previewMyErasure = onCall<void, Promise<ErasurePreview>>(
  { region: REGION, enforceAppCheck: true, memory: '512MiB', timeoutSeconds: 300 },
  async (request) => {
    checkAppCheckToken(request, 'previewMyErasure');
    checkAuthentication(request, 'previewMyErasure');

    const ctx = await subjectCtxOf(request.auth!.uid);
    const preview = await freshPreview(ctx);
    // no PII in logs — counts only
    logger.info(`previewMyErasure: uid=${ctx.uid} tenant=${ctx.tenantId} blockers=${preview.blockers.length}`);
    return preview;
  },
);

/** Executes the erasure the member confirmed — tenant-scoped, never global (D-P5-2). */
export const eraseMyData = onCall<{ previewToken?: string }, Promise<EraseMyDataResponse>>(
  { region: REGION, enforceAppCheck: true, memory: '512MiB', timeoutSeconds: 540, secrets: ERASURE_SECRETS },
  async (request) => {
    checkAppCheckToken(request, 'eraseMyData');
    checkAuthentication(request, 'eraseMyData');

    const ctx = await subjectCtxOf(request.auth!.uid);
    const fresh = await freshPreview(ctx);
    assertExecutable(fresh, request.data?.previewToken);

    const result = await executeErasure(ctx, fresh, SUBJECT_DATA_MAP, firestoreErasureOps());

    logger.info(`eraseMyData: tenant=${ctx.tenantId} collections=${Object.keys(result.counts).length}`);
    await notifyTenantAdmin(ctx.tenantId, result.executedAt);

    return toEraseResponse(result);
  },
);
