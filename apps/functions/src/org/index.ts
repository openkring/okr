// apps/functions/src/org/index.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { OrgCollection } from '@okr/shared-models';
import { writeAddressDirectory } from '@okr/shared-util-functions';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { requireMemberAdmin } from '../person';

const REGION = 'europe-west6';

/**
 * Shares an existing org into the caller's tenant (arrayUnion, idempotent) — the org
 * counterpart of `mergePersonIntoTenant`, and the only way to create the dual-tenant
 * org the partner channel joins on (spec 1.26 C1 §6, follow-up (a)).
 *
 * No field reconciliation: an org is shared, not merged — the `bkg`-side record stays
 * authoritative. The projection rebuild is the part that cannot be skipped: the
 * `address-directory` rows are written per tenant, and nothing else re-fires for the
 * newly added tenant until the org's next address write.
 */
export const mergeOrgIntoTenant = onCall(
  { region: REGION },
  async (request): Promise<{ okey: string }> => {
    checkAppCheckToken(request, 'mergeOrgIntoTenant');
    checkAuthentication(request, 'mergeOrgIntoTenant');
    const callerTenants = await requireMemberAdmin(request.auth?.uid, 'mergeOrgIntoTenant');

    const { orgKey, tenantId } = (request.data ?? {}) as { orgKey?: string; tenantId?: string };
    if (!orgKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'orgKey and tenantId are required.');
    }
    if (!callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'Caller does not belong to the target tenant.');
    }

    const db = getFirestore();
    const ref = db.collection(OrgCollection).doc(orgKey);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', `Org ${orgKey} not found.`);

    await ref.update({ tenants: FieldValue.arrayUnion(tenantId) });
    await writeAddressDirectory(db, `org.${orgKey}`);
    return { okey: orgKey };
  },
);
