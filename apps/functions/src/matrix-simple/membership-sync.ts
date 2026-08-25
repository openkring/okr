// apps/functions/src/matrix-simple/membership-sync.ts
//
// Server-side membership → Matrix-room synchronization (chat design review #3,
// planning/specs/2026-07-05-chat-design-review-spec.md).
//
// Until now, group-chat invites/kicks were fired only from the browser
// (MembershipStore → invitePersonToGroupRoom / kickPersonFromGroupRoom CFs), so a
// membership written by an import, an admin script, or a client that crashed
// mid-flow silently drifted from the Matrix room. The Firestore trigger below is
// the guaranteed mechanism; the client calls remain a latency optimization (both
// paths are idempotent — "already in room" / "not in room" are tolerated).

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';

import {
  MATRIX_HOMESERVER,
  matrixAdminToken,
  ensureMatrixUserExists,
  resolveGroupRoom,
  requireRole,
  serverHostname,
  ensureAdminInRoom,
  forceJoinUserToRoom,
  kickUserFromRoom,
  getUserTenants,
  activeGroupMemberKeys,
} from './shared';

const MEMBERSHIP_COLLECTION = 'memberships';
const GROUP_COLLECTION = 'groups';

/** Matrix accounts that legitimately live in every room and must never be reported/kicked. */
const SERVICE_ACCOUNT_LOCALPARTS = new Set(['bk2-bot', 'bruno']);

// Inlined subset of MembershipModel to avoid monorepo cross-bundle imports
// (same pattern as task/index.ts and calendar/index.ts).
interface MembershipDoc {
  memberKey: string;
  memberModelType: 'person' | 'org' | 'group';
  orgKey: string;
  orgModelType: 'org' | 'group';
  dateOfExit?: string;
  isArchived?: boolean;
  tenants?: string[];
}

/**
 * A membership grants group-chat access iff it links a person to a group and is
 * active today (not archived, and either never ended or with a future exit date).
 *
 * NOTE: this used to treat ANY dateOfExit other than '' / '9999*' as inactive, which
 * kicked members the moment an admin entered a FUTURE exit date — months early, and
 * inconsistent with MembershipService.isMemberOf, which compares with isAfterDate.
 * isActiveMembership is now the single shared definition
 * (planning/specs/2026-08-12-membership-account-sync-design.md).
 */
function grantsChatAccess(doc: MembershipDoc | undefined, today: string): boolean {
  if (!doc) return false;
  if (doc.orgModelType !== 'group' || doc.memberModelType !== 'person') return false;
  return isActiveMembership(doc, today);
}

/**
 * Firestore trigger: keep the group's Matrix room in sync with membership writes,
 * regardless of who wrote them (app, import, admin script).
 *
 * Transitions handled:
 *  - gains chat access (created active, un-ended, un-archived)      → provision + invite + force-join
 *  - loses chat access (ended, archived, deleted)                   → kick
 *  - re-keyed while active (memberKey or orgKey changed on update)  → kick old, join new
 *
 * Errors are logged, never thrown: a Matrix hiccup must not fail/retry-storm the
 * Firestore write, and reconcileGroupRoomMembers can repair any missed transition.
 */
export const onMembershipWritten = onDocumentWritten(
  {
    document: `${MEMBERSHIP_COLLECTION}/{membershipId}`,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as MembershipDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as MembershipDoc) : undefined;

    const today = getTodayStr(DateFormat.StoreDate);
    const had = grantsChatAccess(before, today);
    const has = grantsChatAccess(after, today);
    const rekeyed = had && has && (before!.memberKey !== after!.memberKey || before!.orgKey !== after!.orgKey);
    if (had === has && !rekeyed) return; // no chat-relevant transition

    const hostname = serverHostname();
    const adminToken = matrixAdminToken.value();

    try {
      if ((had && !has) || rekeyed) {
        const doc = before!;
        const matrixUserId = `@${doc.memberKey.toLowerCase()}:${hostname}`;
        const roomId = await resolveGroupRoom(doc.orgKey, hostname, adminToken, { create: false });
        if (roomId) {
          await ensureAdminInRoom(roomId, adminToken);
          const kicked = await kickUserFromRoom(roomId, matrixUserId, adminToken, 'Membership ended');
          console.log(`onMembershipWritten: ${matrixUserId} ${kicked ? 'kicked from' : 'was not in'} room ${roomId} (group ${doc.orgKey})`);
        }
      }
      if ((has && !had) || rekeyed) {
        const doc = after!;
        const matrixUserId = `@${doc.memberKey.toLowerCase()}:${hostname}`;
        await ensureMatrixUserExists(matrixUserId, adminToken, { personKey: doc.memberKey });
        const roomId = await resolveGroupRoom(doc.orgKey, hostname, adminToken, { create: true });
        if (!roomId) {
          console.warn(`onMembershipWritten: no room resolvable for group ${doc.orgKey}`);
          return;
        }
        await ensureAdminInRoom(roomId, adminToken);
        await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
        console.log(`onMembershipWritten: ${matrixUserId} joined room ${roomId} (group ${doc.orgKey})`);
      }
    } catch (error) {
      console.error(`onMembershipWritten: sync failed for membership ${event.params.membershipId}:`, error);
    }
  }
);

/**
 * Repair drift for one group: force-join every person with an active group
 * membership into the group's Matrix room.
 *
 * Deliberately additive-only: room members WITHOUT a membership are reported in
 * `extras` but NOT kicked — requestGroupRoomAccess legitimately admits
 * non-members (e.g. training-course participants), so pruning is a human call.
 */
export const reconcileGroupRoomMembers = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; joined: string[]; alreadyIn: string[]; extras: string[] }> => {
    await requireRole(request, 'reconcileGroupRoomMembers', ['admin', 'memberAdmin', 'groupAdmin']);

    const { groupId } = request.data as { groupId: string };
    if (!groupId) throw new HttpsError('invalid-argument', 'groupId is required');

    const hostname = serverHostname();
    const adminToken = matrixAdminToken.value();

    // Desired members: personKeys of active group memberships
    const today = getTodayStr(DateFormat.StoreDate);
    const snap = await getFirestore()
      .collection(MEMBERSHIP_COLLECTION)
      .where('orgKey', '==', groupId)
      .where('orgModelType', '==', 'group')
      .where('memberModelType', '==', 'person')
      .get();
    const desired = new Set(
      snap.docs
        .map((d) => d.data() as MembershipDoc)
        .filter((m) => grantsChatAccess(m, today))
        .map((m) => m.memberKey.toLowerCase())
    );

    const roomId = await resolveGroupRoom(groupId, hostname, adminToken, { create: true });
    if (!roomId) throw new HttpsError('not-found', `No room for group ${groupId}`);

    // Actual members from room state (join or invite)
    const stateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!stateResp.ok) throw new HttpsError('internal', `Failed to get room state: ${await stateResp.text()}`);
    const stateData = await stateResp.json() as { state: Array<{ type: string; state_key: string; content: Record<string, unknown> }> };
    const actual = new Set(
      (stateData.state ?? [])
        .filter((e) => e.type === 'm.room.member' && ['join', 'invite'].includes(e.content['membership'] as string))
        .map((e) => e.state_key.split(':')[0].substring(1).toLowerCase())
    );

    await ensureAdminInRoom(roomId, adminToken);

    const joined: string[] = [];
    const alreadyIn: string[] = [];
    for (const personKey of desired) {
      if (actual.has(personKey)) {
        alreadyIn.push(personKey);
        continue;
      }
      const matrixUserId = `@${personKey}:${hostname}`;
      try {
        await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });
        await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
        joined.push(personKey);
      } catch (error) {
        console.error(`reconcileGroupRoomMembers: failed to join ${matrixUserId}:`, error);
      }
    }

    const extras = [...actual].filter((lp) => !desired.has(lp) && !SERVICE_ACCOUNT_LOCALPARTS.has(lp));

    console.log(`reconcileGroupRoomMembers: group=${groupId} room=${roomId} joined=${joined.length} alreadyIn=${alreadyIn.length} extras=${extras.length}`);
    return { roomId, joined, alreadyIn, extras };
  }
);

// ─── group-room drift audit & prune ──────────────────────────────────────────
//
// `onMembershipWritten` keeps removals in sync, but arrivals need no membership at
// all: `requestGroupRoomAccess` force-joins ANY provisioned user who opens a group's
// chat tab (deliberately — course participants are legitimate). Nothing ever undoes
// that, so a group room can silently accumulate people the group view never shows.
// `reconcileGroupRoomMembers` reports them as `extras` but is additive-only.
//
// These two callables make that drift visible in the AOC chat page and let an admin
// prune it. Pruning is deliberately a separate, explicit, per-group action — never a
// side effect of the reconcile run.

/** One group's room, compared against its active memberships. */
export interface GroupRoomDrift {
  groupKey: string;
  groupName: string;
  roomId: string;
  /** personKeys with an active membership in the group. */
  memberCount: number;
  /** joined+invited room members, service accounts excluded. */
  roomMemberCount: number;
  /** members without a room seat — `reconcileGroupRoomMembers` fixes these. */
  missing: string[];
  /** room members without a membership — `pruneGroupRoomExtras` removes these. */
  extras: Array<{ userId: string; displayName: string }>;
}

/**
 * Read a room's `m.room.member` state as `localpart → displayname`, counting `join`
 * and `invite` alike (an outstanding invite is a seat that will be taken).
 */
async function readRoomMemberState(roomId: string, adminToken: string): Promise<Map<string, string>> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  if (!resp.ok) throw new HttpsError('internal', `Failed to get room state: ${await resp.text()}`);
  const data = await resp.json() as { state: Array<{ type: string; state_key: string; content: Record<string, unknown> }> };
  const members = new Map<string, string>();
  for (const e of data.state ?? []) {
    if (e.type !== 'm.room.member') continue;
    if (!['join', 'invite'].includes(e.content['membership'] as string)) continue;
    const localpart = e.state_key.split(':')[0].substring(1).toLowerCase();
    members.set(localpart, (e.content['displayname'] as string) ?? '');
  }
  return members;
}

/** Run `task` over `items` with at most `size` in flight — the homeserver is not a fan-out target. */
async function inBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(task)));
  }
  return results;
}

/**
 * Compare every group room of one tenant against its active memberships.
 *
 * Read-only: it changes nothing, and is what the AOC chat page calls to show the drift
 * before an admin decides to act on it. Groups with no room, or whose room has vanished
 * from the homeserver, are skipped silently — there is nothing to compare.
 *
 * @param tenantId optional; defaults to (and must be one of) the caller's own tenants.
 */
export const auditGroupRoomMembers = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ groups: GroupRoomDrift[] }> => {
    const uid = await requireRole(request, 'auditGroupRoomMembers', ['admin', 'memberAdmin', 'groupAdmin']);

    // Never audit a tenant the caller is not in: room member display names are personal data.
    const callerTenants = await getUserTenants(uid);
    const { tenantId } = (request.data ?? {}) as { tenantId?: string };
    if (tenantId && !callerTenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', `Not a member of tenant ${tenantId}.`);
    }
    const tenants = tenantId ? [tenantId] : callerTenants;
    if (tenants.length === 0) return { groups: [] };

    const adminToken = matrixAdminToken.value();
    const hostname = serverHostname();

    const snap = await getFirestore()
      .collection(GROUP_COLLECTION)
      .where('tenants', 'array-contains-any', tenants)
      .get();

    const drifts = await inBatches(snap.docs, 8, async (doc): Promise<GroupRoomDrift | undefined> => {
      const groupKey = doc.id;
      try {
        const roomId = await resolveGroupRoom(groupKey, hostname, adminToken, { create: false });
        if (!roomId) return undefined;

        const desired = new Set((await activeGroupMemberKeys(groupKey)).map((k) => k.toLowerCase()));
        const actual = await readRoomMemberState(roomId, adminToken);

        const missing = [...desired].filter((lp) => !actual.has(lp));
        const extras = [...actual.entries()]
          .filter(([lp]) => !desired.has(lp) && !SERVICE_ACCOUNT_LOCALPARTS.has(lp))
          .map(([lp, displayName]) => ({ userId: `@${lp}:${hostname}`, displayName }));
        const roomMemberCount = [...actual.keys()].filter((lp) => !SERVICE_ACCOUNT_LOCALPARTS.has(lp)).length;

        return {
          groupKey,
          groupName: (doc.data()?.['name'] as string) || groupKey,
          roomId,
          memberCount: desired.size,
          roomMemberCount,
          missing,
          extras,
        };
      } catch (error) {
        // One unreachable room must not fail the whole audit.
        console.warn(`auditGroupRoomMembers: skipped group ${groupKey}: ${(error as Error).message}`);
        return undefined;
      }
    });

    const groups = drifts.filter((d): d is GroupRoomDrift => d !== undefined);
    console.log(`auditGroupRoomMembers: tenants=${tenants.join(',')} groups=${groups.length} drifted=${groups.filter(g => g.extras.length || g.missing.length).length}`);
    return { groups };
  }
);

/**
 * Remove room members who hold no active membership in the group.
 *
 * The `userIds` from the client are a REQUEST, not an instruction: every one is
 * re-checked against `activeGroupMemberKeys` here, so a stale preview (someone was added
 * to the group between scan and apply) can never kick an actual member. Service accounts
 * are refused outright — `@bk2-bot` must stay in every room for the admin escalation path.
 */
export const pruneGroupRoomExtras = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; kicked: string[]; refused: string[] }> => {
    const uid = await requireRole(request, 'pruneGroupRoomExtras', ['admin', 'memberAdmin', 'groupAdmin']);

    const { groupId, userIds } = request.data as { groupId: string; userIds: string[] };
    if (!groupId) throw new HttpsError('invalid-argument', 'groupId is required');
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new HttpsError('invalid-argument', 'userIds must be a non-empty array');
    }

    const groupSnap = await getFirestore().collection(GROUP_COLLECTION).doc(groupId).get();
    if (!groupSnap.exists) throw new HttpsError('not-found', `Group ${groupId} not found`);
    const groupTenants = (groupSnap.data()?.['tenants'] ?? []) as string[];
    const callerTenants = await getUserTenants(uid);
    if (!groupTenants.some((t) => callerTenants.includes(t))) {
      throw new HttpsError('permission-denied', `Group ${groupId} is not in one of your tenants.`);
    }

    const adminToken = matrixAdminToken.value();
    const hostname = serverHostname();
    const roomId = await resolveGroupRoom(groupId, hostname, adminToken, { create: false });
    if (!roomId) throw new HttpsError('not-found', `No room for group ${groupId}`);

    const protectedKeys = new Set((await activeGroupMemberKeys(groupId)).map((k) => k.toLowerCase()));
    await ensureAdminInRoom(roomId, adminToken);

    const kicked: string[] = [];
    const refused: string[] = [];
    for (const userId of userIds) {
      const localpart = userId.split(':')[0].replace(/^@/, '').toLowerCase();
      if (protectedKeys.has(localpart) || SERVICE_ACCOUNT_LOCALPARTS.has(localpart)) {
        refused.push(userId);
        continue;
      }
      try {
        if (await kickUserFromRoom(roomId, `@${localpart}:${hostname}`, adminToken, 'Keine Mitgliedschaft in dieser Gruppe')) {
          kicked.push(userId);
        }
      } catch (error) {
        console.error(`pruneGroupRoomExtras: failed to kick ${userId} from ${roomId}:`, error);
        refused.push(userId);
      }
    }

    console.log(`pruneGroupRoomExtras: group=${groupId} room=${roomId} kicked=${kicked.length} refused=${refused.length}`);
    return { roomId, kicked, refused };
  }
);
