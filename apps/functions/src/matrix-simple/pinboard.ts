// apps/functions/src/matrix-simple/pinboard.ts
//
// Pinnwand (planning/specs/2026-10-11-chat-pinnwand-spec.md): ein Gruppendokument mit
// `kind: 'pinboard'`. Die Mitglieder sind echte `memberships` mit deterministischer id,
// abgeleitet aus `sourceGroupKeys` — `onMembershipWritten` macht daraus unveraendert den
// Zwangsbeitritt und den Kick. Hier steht nur, WER Mitglied ist.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';

import { activeGroupMemberKeys } from './shared';
import { isPinboardKey, pinboardMembershipId, planPinboardMembership, PinboardMembershipState, PinboardPlan } from './pinboard.util';

type GroupDoc = {
  name?: string; kind?: string; tenants?: string[]; isArchived?: boolean;
  sourceGroupKeys?: string[]; joinMode?: 'optOut' | 'optIn'; admins?: { key: string }[];
};

export function pinboardMembershipDoc(
  person: { okey: string; firstName: string; lastName: string }, groupKey: string, name: string, tenant: string,
): Record<string, unknown> {
  return {
    tenants: [tenant], isArchived: false, tags: '', notes: '',
    index: `mn:${person.firstName} ${person.lastName} mk:${person.okey} ok:${groupKey} on:${name}`,
    memberKey: person.okey, memberName1: person.firstName, memberName2: person.lastName,
    memberModelType: 'person', memberType: 'male', memberNickName: '', memberAbbreviation: '',
    memberBirthYear: '', memberIsDeceased: false, memberDeathYear: '', memberZipCode: '',
    memberBexioId: '', memberId: '',
    orgKey: groupKey, orgName: name, orgModelType: 'group',
    dateOfEntry: getTodayStr(DateFormat.StoreDate), dateOfExit: '99991231',
    category: 'active', state: 'active', orgFunction: '', order: 1, relLog: '', relIsLast: true,
    rebate: 0, rebateReason: 'none', isOptedOut: false,
  };
}

/**
 * Gleicht die Mitgliedschaften einer Pinnwand mit ihren Quellgruppen ab. Mit `only` nur fuer
 * eine Person (Trigger). Schreibt nur Differenzen; der Matrix-Teil folgt ueber
 * `onMembershipWritten`. Gibt den ausgefuehrten Plan zurueck (Log und Tests).
 */
export async function reconcilePinboard(groupKey: string, only?: string): Promise<PinboardPlan> {
  const db = getFirestore();
  const groupSnap = await db.collection('groups').doc(groupKey).get();
  const group = groupSnap.data() as GroupDoc | undefined;
  if (!group || (group.kind ?? 'group') !== 'pinboard' || group.isArchived) return { add: [], end: [] };
  const tenant = (group.tenants ?? [])[0];
  if (!tenant) return { add: [], end: [] };

  const eligible = new Set<string>();
  for (const source of group.sourceGroupKeys ?? []) {
    for (const key of await activeGroupMemberKeys(source)) eligible.add(key);
  }
  const keep = new Set((group.admins ?? []).map((a) => a.key).filter(Boolean));

  const today = getTodayStr(DateFormat.StoreDate);
  const existing = await db.collection('memberships')
    .where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').get();
  const current = new Map<string, PinboardMembershipState>();
  for (const doc of existing.docs) {
    const m = doc.data() as { memberKey: string; dateOfExit?: string; isArchived?: boolean; isOptedOut?: boolean };
    const state = { active: isActiveMembership(m, today), isOptedOut: m.isOptedOut ?? false };
    const prev = current.get(m.memberKey);
    if (!prev || state.active) current.set(m.memberKey, state); // an active doc wins over an ended one
  }

  const plan = planPinboardMembership({ joinMode: group.joinMode ?? 'optOut', eligible, keep, current, only });
  if (plan.add.length === 0 && plan.end.length === 0) return plan;

  const name = group.name ?? '';
  const batch = db.batch();
  for (const key of plan.add) {
    const p = (await db.collection('persons').doc(key).get()).data() ?? {};
    batch.set(db.collection('memberships').doc(pinboardMembershipId(groupKey, key)), pinboardMembershipDoc(
      { okey: key, firstName: (p['firstName'] as string) ?? '', lastName: (p['lastName'] as string) ?? '' },
      groupKey, name, tenant));
  }
  for (const key of plan.end) {
    batch.set(db.collection('memberships').doc(pinboardMembershipId(groupKey, key)),
      { dateOfExit: today, isArchived: true, isOptedOut: false }, { merge: true });
  }
  await batch.commit();
  console.log(`reconcilePinboard: ${groupKey}${only ? ` (${only})` : ''} add=${plan.add.length} end=${plan.end.length}`);
  return plan;
}

/** Eine Quell-Mitgliedschaft hat sich geaendert → diese eine Person in allen betroffenen Pinnwaenden abgleichen. */
export const onPinboardSourceMembershipWritten = onDocumentWritten(
  { document: 'memberships/{membershipId}', region: 'europe-west6' },
  async (event) => {
    const before = event.data?.before?.data() as { orgKey?: string; orgModelType?: string; memberKey?: string; memberModelType?: string } | undefined;
    const after = event.data?.after?.data() as typeof before;
    const doc = after ?? before;
    if (!doc || doc.orgModelType !== 'group' || doc.memberModelType !== 'person' || !doc.orgKey || !doc.memberKey) return;
    // Pinnwand-Mitgliedschaften selbst nie weiterverfolgen — sonst Rekursion.
    if (isPinboardKey(doc.orgKey) || event.params.membershipId.startsWith('pb_')) return;
    try {
      const pinboards = await getFirestore().collection('groups')
        .where('sourceGroupKeys', 'array-contains', doc.orgKey).get();
      for (const pb of pinboards.docs) {
        if ((pb.data()['kind'] ?? 'group') !== 'pinboard') continue;
        await reconcilePinboard(pb.id, doc.memberKey);
        if (before?.memberKey && after?.memberKey && before.memberKey !== after.memberKey) {
          await reconcilePinboard(pb.id, before.memberKey);
        }
      }
    } catch (error) {
      console.error(`onPinboardSourceMembershipWritten: failed for ${event.params.membershipId}:`, error);
    }
  },
);

/** Quellgruppen oder Teilnahme geaendert → ganze Pinnwand abgleichen. */
export const onPinboardWritten = onDocumentWritten(
  { document: 'groups/{groupId}', region: 'europe-west6' },
  async (event) => {
    const before = event.data?.before?.data() as GroupDoc | undefined;
    const after = event.data?.after?.data() as GroupDoc | undefined;
    if (!after || (after.kind ?? 'group') !== 'pinboard' || after.isArchived) return;
    const sourcesChanged = JSON.stringify([...(before?.sourceGroupKeys ?? [])].sort()) !==
      JSON.stringify([...(after.sourceGroupKeys ?? [])].sort());
    const modeChanged = (before?.joinMode ?? 'optOut') !== (after.joinMode ?? 'optOut');
    if (!sourcesChanged && !modeChanged) return;
    try {
      await reconcilePinboard(event.params.groupId);
    } catch (error) {
      console.error(`onPinboardWritten: failed for ${event.params.groupId}:`, error);
    }
  },
);

/** Naechtlicher Abgleich aller Pinnwaende — repariert verpasste Trigger. */
export const sweepPinboards = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6' },
  async () => {
    const snap = await getFirestore().collection('groups').where('kind', '==', 'pinboard').get();
    let changed = 0;
    for (const doc of snap.docs) {
      try {
        const plan = await reconcilePinboard(doc.id);
        if (plan.add.length + plan.end.length > 0) changed++;
      } catch (error) {
        console.error(`sweepPinboards: failed for ${doc.id}:`, error);
      }
    }
    console.log(`sweepPinboards: pinboards=${snap.size} changed=${changed}`);
  },
);
