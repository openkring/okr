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
} from './shared';

const MEMBERSHIP_COLLECTION = 'memberships';

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
