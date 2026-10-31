// apps/functions/src/badge/person-part.ts
//
// Writes one part the server can compute itself (tasks, invitations) into the badge ledger of
// every account of ONE PERSON in ONE TENANT (spec 1.127 §3.7 B1). A person is not an account:
// a member of two clubs has two `users/{uid}` docs and two ledgers, and only the one of the
// tenant the change belongs to moves. Gated per account by `badgePartFor` (role `registered`).

import { logger } from 'firebase-functions/v2';

import { accountsInTenant, badgePartFor } from '../srv/push';
import { setBadgePart } from './ledger';

/**
 * Recomputes `part` for the person's accounts in `tenantId`. `count` is called only when the
 * person has such an account, so a guest without an app costs no query. Never throws: the badge
 * is an extra and must not fail the trigger, nor the push that follows it.
 */
export async function setBadgePartForPerson(
  personKey: string,
  tenantId: string,
  part: 'tasks' | 'invitations',
  count: () => Promise<number>,
  context: string,
): Promise<void> {
  if (!personKey || !tenantId) return;
  let accounts: Awaited<ReturnType<typeof accountsInTenant>>;
  let n: number;
  try {
    accounts = await accountsInTenant([personKey], tenantId);
    if (accounts.length === 0) return;
    n = await count();
  } catch (err) {
    logger.warn(`${context}: badge ledger ${part} not recomputed:`, err);
    return;
  }
  // One account's failed write must not keep the person's other account stale.
  await Promise.all(accounts.map((account) =>
    setBadgePart(account.uid, part, badgePartFor(account, n))
      .catch((err) => logger.warn(`${context}: badge ledger ${part} write failed:`, err))));
}
