// apps/functions/src/matrix-simple/pinboard.ts
//
// Pinnwand (planning/specs/2026-10-11-chat-pinnwand-spec.md): ein Gruppendokument mit
// `kind: 'pinboard'`. Die Mitglieder sind echte `memberships` mit deterministischer id,
// abgeleitet aus `sourceGroupKeys` — `onMembershipWritten` macht daraus unveraendert den
// Zwangsbeitritt und den Kick. Hier steht nur, WER Mitglied ist.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';

import {
  matrixAdminToken, requireRole, requireProvisionedUser, requireUserPersonKey, requireParam, checkRateLimit,
  getUserTenants, resolveGroupRoom, ensureAdminInRoom, setRoomName, setRoomTopic, ensureMatrixUserExists,
  forceJoinUserToRoom, serverHostname, activeGroupMemberKeys,
} from './shared';
import { setHistoryVisibility } from './adhoc-chat';
import { isPinboardKey, sourcePairsToReconcile, pinboardMembershipId, planPinboardMembership, mergeMembershipState, validatePinboardInput, pinboardKey, PinboardMembershipState, PinboardPlan } from './pinboard.util';

export type GroupDoc = {
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
  const activeRefs = new Map<string, FirebaseFirestore.DocumentReference[]>(); // das tatsaechliche Dokument, egal mit welcher id
  for (const doc of existing.docs) {
    const m = doc.data() as { memberKey: string; dateOfExit?: string; isArchived?: boolean; isOptedOut?: boolean };
    const state = { active: isActiveMembership(m, today), isOptedOut: m.isOptedOut ?? false };
    if (state.active) activeRefs.set(m.memberKey, [...(activeRefs.get(m.memberKey) ?? []), doc.ref]);
    current.set(m.memberKey, mergeMembershipState(current.get(m.memberKey), state)); // active beats ended; among ended, opted-out wins
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
    // Das echte Dokument beenden (Client-Anlage nutzt zufaellige ids) — nie die deterministische id anlegen.
    for (const ref of activeRefs.get(key) ?? []) {
      batch.update(ref, { dateOfExit: today, isArchived: true, isOptedOut: false });
    }
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
      for (const [orgKey, personKey] of sourcePairsToReconcile(before, after)) {
        const pinboards = await getFirestore().collection('groups')
          .where('sourceGroupKeys', 'array-contains', orgKey).get();
        for (const pb of pinboards.docs) {
          if ((pb.data()['kind'] ?? 'group') !== 'pinboard') continue;
          await reconcilePinboard(pb.id, personKey);
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
    const adminKeys = (g?: GroupDoc) => JSON.stringify((g?.admins ?? []).map((a) => a.key).filter(Boolean).sort());
    const adminsChanged = adminKeys(before) !== adminKeys(after);
    const modeChanged = (before?.joinMode ?? 'optOut') !== (after.joinMode ?? 'optOut');
    if (!sourcesChanged && !modeChanged && !adminsChanged) return;
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

// ---------------------------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------------------------

const CALLABLE = { cors: true, region: 'europe-west6', enforceAppCheck: true, secrets: [matrixAdminToken] } as const;
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

type PinboardGroup = GroupDoc & { matrixRoomId?: string; notes?: string; allowReplyAll?: boolean };

function randomKeyPart(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
}

/** Laedt die Pinnwand und prueft, dass der Aufrufer im selben Mandanten ist. */
async function loadPinboard(uid: string, groupKey: string): Promise<{ group: PinboardGroup; tenant: string }> {
  const snap = await getFirestore().collection('groups').doc(groupKey).get();
  const group = snap.data() as PinboardGroup | undefined;
  if (!snap.exists || !group) throw new HttpsError('not-found', `Pinboard ${groupKey} not found`);
  if ((group.kind ?? 'group') !== 'pinboard') throw new HttpsError('failed-precondition', `${groupKey} is not a pinboard.`);
  const tenant = (group.tenants ?? [])[0];
  if (!tenant || !(await getUserTenants(uid)).includes(tenant)) throw new HttpsError('permission-denied', 'Not a member of this tenant.');
  return { group, tenant };
}

/** Jede Quellgruppe muss eine echte Gruppe desselben Mandanten sein. */
async function assertSourceGroups(keys: string[], tenant: string): Promise<void> {
  const db = getFirestore();
  for (const key of keys) {
    const data = (await db.collection('groups').doc(key).get()).data();
    if (!data || (data['kind'] ?? 'group') !== 'group' || !((data['tenants'] ?? []) as string[]).includes(tenant)) {
      throw new HttpsError('invalid-argument', `${key} is not a group of this tenant.`);
    }
  }
}

/** Alle Mitgliedschaften einer Person in einer Pinnwand, egal mit welcher id (generisches UI nutzt zufaellige ids). */
async function personMembershipDocs(groupKey: string, personKey: string) {
  const snap = await getFirestore().collection('memberships')
    .where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').where('memberKey', '==', personKey).get();
  return snap.docs;
}

type MembershipFlags = { dateOfExit?: string; isArchived?: boolean; isOptedOut?: boolean };

export const createPinboard = onCall(CALLABLE, async (request): Promise<{ groupKey: string; roomId: string; name: string }> => {
  const uid = await requireRole(request, 'createPinboard', ['privileged', 'admin']);
  checkRateLimit(uid, 'createPinboard', 5);
  const data = request.data as { tenantId?: string; name?: string; description?: string; sourceGroupKeys?: string[]; joinMode?: 'optOut' | 'optIn'; allowReplyAll?: boolean };
  const tenant = requireParam(data.tenantId, 'tenantId', 50);
  const error = validatePinboardInput(data, false);
  if (error) throw new HttpsError('invalid-argument', error);
  if (!(await getUserTenants(uid)).includes(tenant)) throw new HttpsError('permission-denied', 'Not a member of this tenant.');
  const sources = [...new Set(data.sourceGroupKeys as string[])];
  await assertSourceGroups(sources, tenant);

  const db = getFirestore();
  const creatorKey = await requireUserPersonKey(uid, 'createPinboard');
  const creator = (await db.collection('persons').doc(creatorKey).get()).data() ?? {};
  let groupKey = '';
  for (let attempt = 0; attempt < 5 && !groupKey; attempt++) {
    const candidate = pinboardKey(tenant, randomKeyPart());
    if (!(await db.collection('groups').doc(candidate).get()).exists) groupKey = candidate;
  }
  if (!groupKey) throw new HttpsError('internal', 'Could not allocate a pinboard key.');
  const name = (data.name as string).trim();
  const description = (data.description ?? '').trim();

  // Reihenfolge wie bei createAdhocChat: Dokument → Raum → Mitgliedschaften.
  await db.collection('groups').doc(groupKey).set({
    name, kind: 'pinboard', notes: description, tags: '', icon: 'group',
    hasContent: false, hasChat: true, hasCalendar: false, hasTasks: false, hasFiles: false, filesFolder: '', hasMembers: false,
    matrixRoomId: '',
    admins: [{ key: creatorKey, name1: (creator['firstName'] as string) ?? '', name2: (creator['lastName'] as string) ?? '', modelType: 'person', type: '', subType: '', label: '' }],
    parentKey: tenant, parentName: '', parentModelType: 'org', visibility: '',
    notifyType: 'memberOnly', chatMode: 'members', postPolicy: 'all',
    sourceGroupKeys: sources, joinMode: data.joinMode ?? 'optOut', allowReplyAll: data.allowReplyAll ?? false,
    tenants: [tenant], isArchived: false, index: `n:${name} k:${groupKey}`,
  });

  const hostname = serverHostname();
  const adminToken = matrixAdminToken.value();
  const roomId = await resolveGroupRoom(groupKey, hostname, adminToken, { create: true });
  if (!roomId) throw new HttpsError('internal', `No room for pinboard ${groupKey}`);
  await ensureAdminInRoom(roomId, adminToken);
  await setRoomName(roomId, name, adminToken);
  if (description) await setRoomTopic(roomId, description, adminToken);
  // Neue Mitglieder sollen die bestehenden Aushaenge sehen.
  await setHistoryVisibility(roomId, 'shared', adminToken);

  await reconcilePinboard(groupKey);
  const creatorMatrixId = `@${creatorKey.toLowerCase()}:${hostname}`;
  await ensureMatrixUserExists(creatorMatrixId, adminToken, { personKey: creatorKey });
  await forceJoinUserToRoom(roomId, creatorMatrixId, adminToken);

  console.log(`createPinboard: ${groupKey} ("${name}") sources=${sources.join(',')} room ${roomId}`);
  return { groupKey, roomId, name };
});

export const updatePinboard = onCall(CALLABLE, async (request): Promise<{ updated: true }> => {
  const uid = await requireRole(request, 'updatePinboard', ['privileged', 'admin']);
  checkRateLimit(uid, 'updatePinboard', 20);
  const data = request.data as { groupKey?: string; name?: string; description?: string; sourceGroupKeys?: string[]; joinMode?: 'optOut' | 'optIn'; allowReplyAll?: boolean };
  const groupKey = requireParam(data.groupKey, 'groupKey', 100);
  const error = validatePinboardInput(data, true);
  if (error) throw new HttpsError('invalid-argument', error);
  const { group, tenant } = await loadPinboard(uid, groupKey);

  const patch: Record<string, unknown> = {};
  let name = group.name ?? '';
  if (data.name !== undefined) { name = data.name.trim(); patch['name'] = name; patch['index'] = `n:${name} k:${groupKey}`; }
  if (data.description !== undefined) patch['notes'] = data.description.trim();
  if (data.sourceGroupKeys !== undefined) {
    const sources = [...new Set(data.sourceGroupKeys)];
    await assertSourceGroups(sources, tenant);
    patch['sourceGroupKeys'] = sources;
  }
  if (data.joinMode !== undefined) patch['joinMode'] = data.joinMode;
  if (data.allowReplyAll !== undefined) patch['allowReplyAll'] = data.allowReplyAll;
  if (Object.keys(patch).length > 0) await getFirestore().collection('groups').doc(groupKey).update(patch);

  if (data.name !== undefined || data.description !== undefined) {
    const adminToken = matrixAdminToken.value();
    const roomId = group.matrixRoomId || await resolveGroupRoom(groupKey, serverHostname(), adminToken, { create: false });
    if (roomId) {
      await ensureAdminInRoom(roomId, adminToken);
      if (data.name !== undefined) await setRoomName(roomId, name, adminToken);
      if (data.description !== undefined) await setRoomTopic(roomId, data.description.trim(), adminToken);
    }
  }
  // Quellen- und Modus-Aenderungen gleicht der Gruppen-Trigger (onPinboardWritten) ab.
  return { updated: true };
});

export const archivePinboard = onCall(CALLABLE, async (request): Promise<{ archived: true }> => {
  const uid = await requireRole(request, 'archivePinboard', ['privileged', 'admin']);
  checkRateLimit(uid, 'archivePinboard', 5);
  const groupKey = requireParam((request.data as { groupKey?: string }).groupKey, 'groupKey', 100);
  await loadPinboard(uid, groupKey);

  const db = getFirestore();
  await db.collection('groups').doc(groupKey).update({ isArchived: true });
  const today = getTodayStr(DateFormat.StoreDate);
  const snap = await db.collection('memberships').where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').get();
  const batch = db.batch();
  for (const doc of snap.docs) {
    if (isActiveMembership(doc.data() as MembershipFlags & { dateOfExit?: string }, today)) {
      batch.update(doc.ref, { dateOfExit: today, isArchived: true, isOptedOut: false });
    }
  }
  await batch.commit();
  // Den Raum raeumt onGroupChatCleanup auf.
  console.log(`archivePinboard: ${groupKey} ended ${snap.size} candidate membership docs`);
  return { archived: true };
});

export const leavePinboard = onCall(CALLABLE, async (request): Promise<{ left: boolean }> => {
  const uid = await requireProvisionedUser(request, 'leavePinboard');
  checkRateLimit(uid, 'leavePinboard', 20);
  const groupKey = requireParam((request.data as { groupKey?: string }).groupKey, 'groupKey', 100);
  await loadPinboard(uid, groupKey);
  const personKey = await requireUserPersonKey(uid, 'leavePinboard');

  const today = getTodayStr(DateFormat.StoreDate);
  const active = (await personMembershipDocs(groupKey, personKey))
    .filter((d) => isActiveMembership(d.data() as MembershipFlags & { dateOfExit?: string }, today));
  if (active.length === 0) return { left: false };
  // Das Austritts-Kennzeichen sitzt auf dem beendeten Dokument; reconcilePinboard haelt die Person damit draussen.
  const batch = getFirestore().batch();
  for (const doc of active) batch.update(doc.ref, { dateOfExit: today, isArchived: true, isOptedOut: true });
  await batch.commit();
  return { left: true };
});

export const joinPinboard = onCall(CALLABLE, async (request): Promise<{ roomId: string }> => {
  const uid = await requireProvisionedUser(request, 'joinPinboard');
  checkRateLimit(uid, 'joinPinboard', 20);
  const groupKey = requireParam((request.data as { groupKey?: string }).groupKey, 'groupKey', 100);
  const { group, tenant } = await loadPinboard(uid, groupKey);
  if (group.isArchived) throw new HttpsError('failed-precondition', 'This pinboard is archived.');
  const personKey = await requireUserPersonKey(uid, 'joinPinboard');

  const isAdmin = (group.admins ?? []).some((a) => a.key === personKey);
  let eligible = isAdmin;
  for (const source of group.sourceGroupKeys ?? []) {
    if (eligible) break;
    eligible = (await activeGroupMemberKeys(source)).includes(personKey);
  }
  if (!eligible) throw new HttpsError('permission-denied', 'Not a member of a source group.');

  const db = getFirestore();
  const person = (await db.collection('persons').doc(personKey).get()).data() ?? {};
  // Ein frueherer Austritt unter anderer id darf reconcile nicht mehr draussen halten.
  const existing = await personMembershipDocs(groupKey, personKey);
  const batch = db.batch();
  for (const doc of existing) {
    if ((doc.data() as MembershipFlags).isOptedOut) batch.update(doc.ref, { isOptedOut: false });
  }
  batch.set(db.collection('memberships').doc(pinboardMembershipId(groupKey, personKey)), pinboardMembershipDoc(
    { okey: personKey, firstName: (person['firstName'] as string) ?? '', lastName: (person['lastName'] as string) ?? '' },
    groupKey, group.name ?? '', tenant));
  await batch.commit();

  const hostname = serverHostname();
  const adminToken = matrixAdminToken.value();
  const roomId = group.matrixRoomId || await resolveGroupRoom(groupKey, hostname, adminToken, { create: false });
  if (!roomId) throw new HttpsError('failed-precondition', `No room for pinboard ${groupKey}`);
  const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
  await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });
  await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
  return { roomId };
});

export const listAvailablePinboards = onCall(CALLABLE, async (request): Promise<{ pinboards: { groupKey: string; name: string; description: string; roomId: string }[] }> => {
  const uid = await requireProvisionedUser(request, 'listAvailablePinboards');
  checkRateLimit(uid, 'listAvailablePinboards', 60);
  const tenant = requireParam((request.data as { tenantId?: string }).tenantId, 'tenantId', 50);
  if (!(await getUserTenants(uid)).includes(tenant)) throw new HttpsError('permission-denied', 'Not a member of this tenant.');
  const personKey = await requireUserPersonKey(uid, 'listAvailablePinboards');

  const today = getTodayStr(DateFormat.StoreDate);
  const snap = await getFirestore().collection('groups').where('kind', '==', 'pinboard').get();
  const pinboards: { groupKey: string; name: string; description: string; roomId: string }[] = [];
  for (const doc of snap.docs) {
    const g = doc.data() as PinboardGroup;
    if (g.isArchived || !(g.tenants ?? []).includes(tenant)) continue;
    let eligible = (g.admins ?? []).some((a) => a.key === personKey);
    for (const source of g.sourceGroupKeys ?? []) {
      if (eligible) break;
      eligible = (await activeGroupMemberKeys(source)).includes(personKey);
    }
    if (!eligible) continue;
    const mine = await personMembershipDocs(doc.id, personKey);
    if (mine.some((d) => isActiveMembership(d.data() as MembershipFlags & { dateOfExit?: string }, today))) continue;
    pinboards.push({ groupKey: doc.id, name: g.name ?? '', description: g.notes ?? '', roomId: g.matrixRoomId ?? '' });
  }
  return { pinboards };
});
