// apps/functions/src/calendar/invitation-count.ts
//
// The invitation part of the server badge ledger (spec 1.127 §3.7 B1): the number of
// invitations a person can still answer in one tenant. It must be the number the app shows —
// `AppStore.openInvitationCount` (libs/shared/feature/src/lib/app.store.ts) — so this reuses
// its query (`getSystemQuery` + `inviteeKey`) and its rule (`countableInvitationsOf`), and reads
// the events the way `FirestoreService.readTenantModel` does. Keep the three in sync.
//
// Known gap kept as is (spec 1.127 phase 2): a day-2 invitation of a multi-day event is not
// counted (`inv.date` is past), although `shouldNotifyInvitation` still pushes it.

import { getFirestore } from 'firebase-admin/firestore';
import type { CalEventModel, InvitationModel } from '@okr/shared-models';
import { countableInvitationsOf, getSystemQuery, SYSTEM_TENANT } from '@okr/shared-util-core';

/**
 * The event as the app's `readTenantModel` hands it to the badge: the doc when it exists, is not
 * archived and belongs to the tenant (or to `system`), else `null` (= not answerable).
 */
export function tenantEventOrNull(data: Record<string, unknown> | undefined, tenantId: string): CalEventModel | null {
  if (!data || data['isArchived'] === true) return null;
  const tenants = (data['tenants'] as string[] | undefined) ?? [];
  return tenants.some((t) => t === tenantId || t === SYSTEM_TENANT) ? (data as unknown as CalEventModel) : null;
}

/** How many invitations `personKey` can still answer in `tenantId` (see file head). */
export async function countOpenInvitations(personKey: string, tenantId: string): Promise<number> {
  if (!personKey || !tenantId) return 0;
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection('invitations');
  for (const clause of getSystemQuery(tenantId)) {
    query = query.where(clause.key, clause.operator as FirebaseFirestore.WhereFilterOp, clause.value);
  }
  // ordered like the app's query (`searchData(…, 'date', 'asc')`), so it runs on the same index
  query = query.where('inviteeKey', '==', personKey).orderBy('date', 'asc');
  const snap = await query.get();
  const invitations = snap.docs.map((doc) => ({ ...doc.data(), okey: doc.id }) as unknown as InvitationModel);

  const keys = [...new Set(invitations.map((inv) => inv.caleventKey).filter((key): key is string => !!key))];
  const events = new Map<string, CalEventModel | null>();
  if (keys.length > 0) {
    const eventSnaps = await db.getAll(...keys.map((key) => db.collection('calevents').doc(key)));
    eventSnaps.forEach((eventSnap, i) => {
      events.set(keys[i], tenantEventOrNull(eventSnap.exists ? eventSnap.data() : undefined, tenantId));
    });
  }
  return countableInvitationsOf(invitations, personKey, events).length;
}
