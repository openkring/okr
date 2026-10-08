import { HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';

import { isAssignableProject, isProfitAndLossAccountId, isProjectKeyShapeValid } from '@okr/shared-util-core';

const PROJECT_COLLECTION = 'projects';

/**
 * Kostenträger per line (spec 3.14 Phase 4, shared by writeBooking and bookBill): every distinct
 * project key of the request must be an active project of the app tenant (projects live in the okr
 * tenant, not in the accounting tenant). A key in `grandfathered` (already stored on the document being
 * rewritten) is not re-checked, like a Kostenstelle. Plain reads: call before the transaction.
 */
export async function assertProjectsAssignable(
  database: Firestore, tenantId: string, lines: { projectKey?: string }[], grandfathered: Set<string> = new Set(),
): Promise<void> {
  const keys = [...new Set(lines.map(l => (l.projectKey ?? '').trim()).filter(k => !!k && !grandfathered.has(k)))];
  if (keys.length === 0) return;
  const snaps = await database.getAll(...keys.map(k => database.collection(PROJECT_COLLECTION).doc(k)));
  snaps.forEach((snap, i) => {
    if (!isAssignableProject(snap.data() as { isArchived?: boolean; tenants?: string[] } | undefined, tenantId)) {
      throw new HttpsError('invalid-argument', `project-invalid: ${keys[i]}`, { reason: 'project-invalid', projectKey: keys[i] });
    }
  });
}

/** A projectKey must be absent or a string without '/' — anything else would crash in .trim() or doc(). */
export function assertProjectKeyShapes(lines: { projectKey?: unknown }[]): void {
  for (const line of lines) {
    if (!isProjectKeyShapeValid(line.projectKey)) {
      throw new HttpsError('invalid-argument', 'project-invalid: malformed projectKey', { reason: 'project-invalid' });
    }
  }
}

/**
 * A Kostenträger belongs on a profit-and-loss line only. Refuses (instead of silently dropping, as
 * `projectKeyForLine` does) a non-empty projectKey on a line whose account is not P&L or is unknown.
 */
export function assertProjectsOnProfitAndLoss(
  accounts: Map<string, { id?: string }>, lines: { accountKey: string; projectKey?: string }[],
): void {
  for (const line of lines) {
    const key = (line.projectKey ?? '').trim();
    if (key && !isProfitAndLossAccountId(accounts.get(line.accountKey)?.id)) {
      throw new HttpsError('invalid-argument', `project-invalid: ${key}`, { reason: 'project-invalid', projectKey: key });
    }
  }
}
