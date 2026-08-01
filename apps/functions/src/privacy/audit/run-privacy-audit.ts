import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AppConfigCollection, UserCollection } from '@okr/shared-models';
import type { AppConfig } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { FIRESTORE_CHECKS } from './checks-firestore';
import { REGISTER_CHECKS } from './checks-register';
import type { AuditCheck, AuditCtx, AuditDoc, AuditResult, Finding } from './types';

const REGION = 'europe-west6';

/** Documents read per collection. An audit is a spot check, not a full export. */
const SCAN_LIMIT = 5000;

/** Order findings by how much they demand of the reader. */
const SEVERITY_RANK: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Sample keys must be identifiers. See `assertNoPersonalData`. */
const SAFE_KEY = /^[A-Za-z0-9_./|-]+$/;

export const ALL_CHECKS: readonly AuditCheck[] = [...FIRESTORE_CHECKS, ...REGISTER_CHECKS];

/**
 * Last line of defence before the result leaves the server.
 *
 * A finding is the one place where data from every collection converges into a single
 * document that gets rendered to an admin and exported to PDF. The checks are each careful
 * to emit ids only; this makes that a property of the endpoint rather than a habit of
 * eleven separate functions. Anything that does not look like an identifier is dropped and
 * logged, never returned.
 */
export function assertNoPersonalData(finding: Finding): Finding {
  const safe = finding.sampleKeys.filter((key) => SAFE_KEY.test(key));
  if (safe.length !== finding.sampleKeys.length) {
    logger.error('runPrivacyAudit: dropped non-identifier sample keys', {
      checkId: finding.checkId, dropped: finding.sampleKeys.length - safe.length,
    });
  }
  return { ...finding, sampleKeys: safe };
}

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.checkId - b.checkId);
}

/**
 * Runs every check.
 *
 * `Promise.allSettled`, not `all`: a check that throws must report itself as an error
 * finding rather than taking the other ten down with it. An audit that returns nothing
 * because one query failed looks exactly like an audit that found nothing wrong.
 */
export async function runChecks(ctx: AuditCtx, checks: readonly AuditCheck[] = ALL_CHECKS): Promise<Finding[]> {
  const settled = await Promise.allSettled(checks.map((check) => check.run(ctx)));

  const findings: Finding[] = [];
  settled.forEach((outcome, index) => {
    const check = checks[index];
    if (outcome.status === 'rejected') {
      logger.error(`runPrivacyAudit: check ${check.id} failed`, outcome.reason);
      findings.push({
        checkId: check.id,
        severity: 'error',
        titleDe: `Prüfung ${check.id} konnte nicht ausgeführt werden`,
        detailDe: 'Die Prüfung ist mit einem Fehler abgebrochen. Das Ergebnis ist deshalb '
          + 'unvollständig — bitte im Serverprotokoll nachsehen und erneut ausführen.',
        count: 1,
        sampleKeys: [],
        fixRoute: '/security/privacy-audit',
      });
    } else if (outcome.value) {
      findings.push(assertNoPersonalData(outcome.value));
    }
  });
  return sortFindings(findings);
}

/**
 * A lazy, memoised collection reader scoped to one tenant.
 *
 * Memoised because several checks read `addresses` and `persons`; without it the audit
 * would pay for the same scan three times. Tenant-filtered in memory rather than by query
 * so that collections without a `tenants` array (and the ones this audit does not know the
 * shape of — check 11 enumerates unknown collections by design) still work.
 */
export function firestoreLoader(tenantId: string): AuditCtx['load'] {
  const cache = new Map<string, Promise<AuditDoc[]>>();
  return (collection) => {
    const hit = cache.get(collection);
    if (hit) return hit;

    const pending = getFirestore().collection(collection).limit(SCAN_LIMIT).get()
      .then((snapshot) => snapshot.docs
        .filter((doc) => {
          const tenants = doc.get('tenants');
          return !Array.isArray(tenants) || tenants.includes(tenantId);
        })
        .map((doc): AuditDoc => ({
          okey: doc.id,
          data: doc.data() ?? {},
          updatedAt: doc.updateTime?.toMillis(),
        })));
    cache.set(collection, pending);
    return pending;
  };
}

export interface RunPrivacyAuditRequest {
  tenantId: string;
}

/**
 * The privacy audit (spec 1.19 Phase 5D).
 *
 * Admin-only and **not** self-service: unlike the data-subject-rights callables, this one
 * reports on the whole tenant, so the caller must be an admin OF the tenant they ask
 * about. The result is ephemeral — nothing is persisted in this slice.
 */
export const runPrivacyAudit = onCall<RunPrivacyAuditRequest, Promise<AuditResult>>(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    checkAppCheckToken(request, 'runPrivacyAudit');
    checkAuthentication(request, 'runPrivacyAudit');

    const tenantId = request.data?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new HttpsError('invalid-argument', 'runPrivacyAudit requires a tenantId.');
    }

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const userSnap = await db.collection(UserCollection).doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'No user document for the caller.');
    }

    const roles = (userSnap.data()?.['roles'] ?? {}) as Record<string, boolean>;
    if (roles['admin'] !== true) {
      throw new HttpsError('permission-denied',
        'Nur Administratoren können den Datenschutz-Check ausführen.');
    }

    // Admin of SOME tenant is not admin of THIS one.
    const callerTenants: string[] = userSnap.data()?.['tenants'] ?? [];
    if (!callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
    }

    const configSnap = await db.doc(`${AppConfigCollection}/${tenantId}`).get();
    const ctx: AuditCtx = {
      tenantId,
      config: (configSnap.data() ?? {}) as AppConfig,
      load: firestoreLoader(tenantId),
      listCollections: async () => (await db.listCollections()).map((c) => c.id),
    };

    const findings = await runChecks(ctx);
    logger.info(`runPrivacyAudit: ${tenantId} — ${findings.length} findings from ${ALL_CHECKS.length} checks`);

    return {
      tenantId,
      ranAt: getTodayStr(DateFormat.StoreDate),
      findings,
      checksRun: ALL_CHECKS.length,
    };
  },
);
