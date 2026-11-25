// apps/functions/src/email/versand-sender.ts
//
// Who may send a Versand, as far as it does not depend on the recipients. `sendMailing` and `sendTestMailing` ask here,
// so a test mail never gets out where the send itself would be refused.
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { GroupCollection } from '@okr/shared-models';

import { assertCallerIsGroupAdmin } from '../content/group-content.util';
import { checkNewsletterGroup } from '../newsletter/signup';
import { isElevated } from './mailing-recipients';

export interface VersandSender {
  /** memberAdmin, privileged or admin of the tenant */
  elevated: boolean;
  /** The newsletter group of the send. Decided here for every caller, never taken from the client. */
  newsletterGroupKey?: string;
  /** The caller's `users` doc; `{}` without one. */
  caller: Record<string, unknown>;
}

/** The live newsletter group `groupKey` names, if it does; one that is archived or another tenant's is refused, never sent the ordinary way. */
async function newsletterGroupOf(db: Firestore, tenantId: string, groupKey: unknown): Promise<string | undefined> {
  if (typeof groupKey !== 'string' || !groupKey) return undefined;
  if ((await checkNewsletterGroup(db, tenantId, groupKey)).ok) return groupKey;
  const group = (await db.collection(GroupCollection).doc(groupKey).get()).data();
  if (group?.['kind'] === 'newsletter') throw new HttpsError('failed-precondition', 'This newsletter is archived or belongs to another tenant.');
  return undefined;
}

/**
 * What `sendMailing` checks of the caller without looking at recipients. Elevated callers of the tenant may send; any other
 * caller must be an admin of `groupKey` (a group, or a newsletter group) and may attach no tenant document and send no
 * answer links. Answer links never go to a group, except a newsletter. Throws `permission-denied`; `invalid-argument` for a
 * `groupKey` that is no document id; `failed-precondition` for a newsletter that is archived or another tenant's, and that
 * only to a member of the tenant: to anybody else every group looks the same.
 */
export async function assertVersandSender(
  db: Firestore,
  args: { uid: string; tenantId: string; groupKey?: unknown; hasStoragePath?: boolean; hasEvents?: boolean },
): Promise<VersandSender> {
  const { uid, tenantId, groupKey } = args;
  if (typeof groupKey === 'string' && groupKey.includes('/')) throw new HttpsError('invalid-argument', 'groupKey must be a document id.');
  const caller = (await db.collection('users').doc(uid).get()).data() ?? {};
  const member = ((caller['tenants'] ?? []) as string[]).includes(tenantId);
  const elevated = isElevated(caller['roles']) && member;
  const newsletterGroupKey = member ? await newsletterGroupOf(db, tenantId, groupKey) : undefined;
  if (newsletterGroupKey) {
    if (!elevated) {
      await assertCallerIsGroupAdmin(db, uid, tenantId, newsletterGroupKey, 'Only an admin of the newsletter may send to its subscribers.');
      if (args.hasStoragePath) throw new HttpsError('permission-denied', 'A group admin may only attach files from the device.');
      if (args.hasEvents) throw new HttpsError('permission-denied', 'A group admin cannot send answer links.');
    }
    return { elevated, newsletterGroupKey, caller };
  }
  if (args.hasEvents && typeof groupKey === 'string' && groupKey) {
    throw new HttpsError('permission-denied', 'A group admin cannot send answer links.');
  }
  if (!elevated) {
    if (typeof groupKey !== 'string' || !groupKey) {
      throw new HttpsError('permission-denied', 'This operation requires the memberAdmin or privileged role.');
    }
    await assertCallerIsGroupAdmin(db, uid, tenantId, groupKey, 'Only an admin of the group may send to its members.');
    if (args.hasStoragePath) throw new HttpsError('permission-denied', 'A group admin may only attach files from the device.');
  }
  return { elevated, caller };
}
