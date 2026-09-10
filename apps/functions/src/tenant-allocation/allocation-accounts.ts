import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { AddressCollection, PersonCollection } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, getCallerTenantId } from '@okr/shared-util-functions';

const REGION = 'europe-west6';

export interface GetAllocationEmailsRequest {
  readonly okey: string;
}

export interface GetAllocationEmailsResponse {
  /** The person's email addresses that Firebase Auth already knows, lower-cased. */
  readonly taken: string[];
}

/**
 * Which of a person's email addresses already carry a Firebase Auth identity (spec 1.47).
 *
 * The allocation dialog needs this BEFORE it opens, to decide whether opening an account for
 * the target tenant is offerable at all: a Firebase identity belongs to exactly one tenant
 * (`UserModel.tenants` — "user has always exactly one tenant") and `createUser` resolves an
 * existing email to the SAME uid, so an address that already has an account can never become
 * a second login. Offering it and failing afterwards would be a worse dialog than not
 * offering it.
 *
 * Takes the PERSON, not a list of emails, on purpose: the addresses are read here rather than
 * accepted from the caller, so this cannot be used to probe whether an arbitrary address has
 * an account. An admin can already do that with `getUidByEmail`, but there is no reason to
 * add a second, cheaper way to do it.
 */
export const getAllocationEmails = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request): Promise<GetAllocationEmailsResponse> => {
    const CF_NAME = 'getAllocationEmails';
    checkAppCheckToken(request, CF_NAME);
    await checkAdminRole(request, CF_NAME);
    const actorTenantId = await getCallerTenantId(request, CF_NAME);

    const data = request.data as GetAllocationEmailsRequest;
    const okey = typeof data?.okey === 'string' ? data.okey : '';
    if (!okey || okey.includes('/')) {
      throw new HttpsError('invalid-argument', 'Es muss eine Person angegeben sein.');
    }

    const db = getFirestore();
    const personSnap = await db.collection(PersonCollection).doc(okey).get();
    const personTenants = (personSnap.data()?.['tenants'] as string[] | undefined) ?? [];
    if (!personSnap.exists || !personTenants.includes(actorTenantId)) {
      // Same answer for "no such person" and "not yours": the caller must not learn which.
      throw new HttpsError('not-found', 'Diese Person gibt es nicht.');
    }

    // parentKey alone, filtered in memory — adding `tenants array-contains` would make this a
    // composite query and cost an index for a handful of documents per person.
    const addressSnap = await db.collection(AddressCollection).where('parentKey', '==', `person.${okey}`).get();
    const emails = addressSnap.docs
      .map((d) => d.data())
      .filter((a) => a['addressChannel'] === 'email' && a['isArchived'] !== true)
      .filter((a) => ((a['tenants'] as string[] | undefined) ?? []).includes(actorTenantId))
      .map((a) => ((a['email'] as string | undefined) ?? '').trim())
      .filter(Boolean);

    const taken: string[] = [];
    for (const email of new Set(emails)) {
      try {
        await getAuth().getUserByEmail(email);
        taken.push(email.toLowerCase());
      } catch {
        // auth/user-not-found — the normal case, and the answer we are looking for.
      }
    }

    // No email addresses in the log — PII (privacy inventory §7.2), same rule as getUidByEmail.
    logger.info(`${CF_NAME}: ${taken.length}/${new Set(emails).size} addresses already have an account`);
    return { taken };
  },
);
