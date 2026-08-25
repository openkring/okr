// apps/functions/src/matrix-simple/rooms.ts
//
// Group-room lifecycle and admin room management: resolve/create, access,
// invite/kick, rename, list, details, members, delete, aliases.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireUserPersonKey,
  requireRole,
  ensureMatrixUserExists,
  resolveGroupRoom,
  resolveAskRoom,
  activeGroupMemberKeys,
  ensureAdminInRoom,
  forceJoinUserToRoom,
  kickUserFromRoom,
  requireParam,
  checkRateLimit,
  serverHostname,
  requireRoomInTenant,
  getRoomTenantsBatch,
  getUserTenants,
  roomAdmitsTenant,
} from './shared';

/**
 * Matrix power level a caller must hold to ring a kiosk device. 100 = room admin.
 * Kept in sync with KIOSK_CALLER_MIN_POWER_LEVEL in `@okr/chat-data-access`, which is the
 * kiosk client's local mirror of this rule (libs cannot be imported here).
 */
const KIOSK_ADMIN_POWER_LEVEL = 100;

/**
 * Request access to the Matrix room for a specific group.
 *
 * The caller must be authenticated with Firebase. The function looks up the
 * Matrix room by the group ID (searching by room name, then by canonical alias),
 * creates it if it doesn't exist yet, and force-joins the caller using the
 * Synapse admin "join" API so no manual invite-accept is needed.
 *
 * Call this from the client whenever the user opens a group chat tab and the
 * room is not yet in their joined-rooms list.
 */
/**
 * Look up the Matrix room ID for a room with the given name.
 * Uses the Synapse admin room-search API.
 * Returns the roomId if exactly one match is found, throws otherwise.
 */
export const getRoomByName = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Not authenticated');
    const { name } = request.data as { name: string };
    requireParam(name, 'name');

    const adminToken = matrixAdminToken.value();
    const searchResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(name)}&limit=20`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!searchResp.ok) {
      throw new HttpsError('internal', `Room search failed: ${await searchResp.text()}`);
    }
    const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };

    // The name search is homeserver-global and this callable needs no role at all, so an
    // exact-name match alone handed any authenticated user another tenant's room id. Room
    // names are NOT unique across tenants — `getRoomByName('Notfall')` is a real call site
    // (section.store) and every tenant has a Notfall room. Keep only matches this tenant
    // may see, then take the exact one.
    const exactMatches = (data.rooms ?? []).filter(r => r.name === name);
    if (exactMatches.length === 0) {
      throw new HttpsError('not-found', `No room found with name "${name}"`);
    }
    const [markers, callerTenants] = await Promise.all([
      getRoomTenantsBatch(exactMatches.map(r => r.room_id), adminToken),
      getUserTenants(uid),
    ]);
    const exact = exactMatches.find(r => roomAdmitsTenant(markers.get(r.room_id) ?? [], callerTenants));
    if (!exact) {
      console.error(`getRoomByName: uid ${uid} (${callerTenants.join(',')}) matched ${exactMatches.length} room(s) named "${name}", none of this tenant`);
      throw new HttpsError('not-found', `No room found with name "${name}"`);
    }
    return { roomId: exact.room_id };
  }
);

export const requestGroupRoomAccess = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; joined: boolean }> => {
    const firebaseUid = request.auth?.uid;
    if (!firebaseUid) {
      throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
    }

    const { groupId } = request.data as { groupId: string };
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'groupId is required');
    }

    // Authorization: the only requirement for group-chat access is being a provisioned
    // system user. Group chats legitimately include non-members and past-members (e.g.
    // training-course participants), so membership is NOT required. SEC-1 (invite-only
    // rooms) ensures non-system Matrix accounts still cannot reach the room.
    // SEC-3: the localpart MUST come from the personKey — no UID fallback, or this
    // becomes a second avenue for duplicate `@<uid>` accounts (S1).
    checkRateLimit(firebaseUid, 'requestGroupRoomAccess', 30);
    // Raw (case-sensitive) key for Firestore lookups, lowercased for the Matrix localpart.
    const personKey = await requireUserPersonKey(firebaseUid, 'requestGroupRoomAccess');
    const localpart = personKey.toLowerCase();

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${localpart}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`requestGroupRoomAccess: uid=${firebaseUid}, matrixUserId=${matrixUserId}, groupId=${groupId}`);

    // Ensure the Matrix account exists (first chat access provisions it)
    await ensureMatrixUserExists(matrixUserId, adminToken, { firebaseUid });

    // Resolve (or create) the room to join. Normally the group's shared room — single
    // source of truth, persisted on the group doc so every CF agrees on one room (fixes
    // S5 duplicate rooms).
    //
    // `chatMode` decides what a NON-member gets (members always land in the shared room):
    //  - 'shared'  (default): force-joined into the group room — open, topical rooms.
    //  - 'ask':    their own room with the whole group — reachable by all, confidential
    //              per requester (Notfall, Support, Vorstand, Kommissionen).
    //  - 'members': refused. The room mirrors the member list exactly (a boat crew).
    //
    // 'shared' and 'ask' admit non-members PERMANENTLY — nothing here or elsewhere ever
    // removes them again, which is why a group room drifts from its member list. That is
    // deliberate for course participants; 'members' is the opt-out for groups where it is not.
    const groupData = (await getFirestore().collection('groups').doc(groupId).get()).data();
    const chatMode = (groupData?.['chatMode'] as string) ?? 'shared';

    // Only 'ask' and 'members' need to know — skip the membership read for plain 'shared'.
    let isMember = true;
    if (chatMode === 'ask' || chatMode === 'members') {
      const memberKeys = await activeGroupMemberKeys(groupId);
      // A group admin without a membership must not be locked out of their own group's chat.
      const admins = (groupData?.['admins'] ?? []) as Array<{ key?: string }>;
      isMember =
        memberKeys.some((k) => k.toLowerCase() === localpart) ||
        admins.some((a) => a.key?.toLowerCase() === localpart);
    }

    if (chatMode === 'members' && !isMember) {
      console.warn(`requestGroupRoomAccess: ${matrixUserId} has no membership in closed group ${groupId}`);
      throw new HttpsError('permission-denied', `Group ${groupId} is members-only.`);
    }
    const useAskRoom = chatMode === 'ask' && !isMember;

    const roomId = useAskRoom
      ? await resolveAskRoom(groupId, personKey, hostname, adminToken, { create: true })
      : await resolveGroupRoom(groupId, hostname, adminToken, { create: true });
    if (!roomId) throw new HttpsError('not-found', `No room for group ${groupId}`);

    // Step 3: Get admin user ID (the MATRIX_ADMIN_TOKEN may belong to a regular user, not a
    // dedicated service account — so we need to get the admin into the room before they can
    // invite or force-join others in invite-only rooms).
    const whoamiResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const adminUserId = whoamiResp.ok
      ? ((await whoamiResp.json()) as { user_id: string }).user_id
      : null;

    // Step 4: Ensure the admin is in the room via make_room_admin.
    // For invite-only rooms (created with old private_chat preset before commit 75c6ac9e),
    // Synapse uses the highest-power existing room member to invite the admin, then auto-joins
    // them. This gets the admin into the room regardless of join_rules.
    // For public rooms (new), the admin is already the room creator — this is a quick no-op.
    if (adminUserId) {
      const makeAdminResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: adminUserId }),
        }
      );
      if (!makeAdminResp.ok) {
        console.warn(`requestGroupRoomAccess: make_room_admin for ${adminUserId} → ${makeAdminResp.status}: ${await makeAdminResp.text()}`);
      }
    }

    // Step 5: Invite the target user. The admin is now in the room (step 4) and can send invites.
    // Ignore errors: "already in room" means user is already a member and the force-join will succeed.
    await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: matrixUserId }),
      }
    );

    // Step 6: Force-join the target user. With a pending invite (step 5), this succeeds even
    // for invite-only rooms. For already-joined users this is a no-op.
    const joinResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: matrixUserId }),
      }
    );
    if (!joinResp.ok) {
      const errText = await joinResp.text();
      // Synapse returns M_FORBIDDEN "<user> is already in the room." when the target is already
      // a member. That is the desired end-state, not a failure — treat it as success so the client
      // still receives the roomId (otherwise the chat falls back to "choose a chat room").
      const alreadyMember = errText.includes('already in the room');
      if (!alreadyMember) {
        console.error(`requestGroupRoomAccess: Admin join failed for ${matrixUserId} in room ${roomId}: ${errText}`);
        throw new HttpsError('internal', `Room access denied for group ${groupId}: ${errText}`);
      }
      console.log(`requestGroupRoomAccess: ${matrixUserId} already in room ${roomId} (treated as joined)`);
    }

    console.log(`requestGroupRoomAccess: User ${matrixUserId} joined room ${roomId} for group ${groupId}`);
    return { roomId, joined: true };
  }
);

/**
 * Invite a specific person (by personKey) to the Matrix room of a group.
 * Called server-side when a new group membership is created, so the member
 * gets access to the group chat immediately without having to open the chat tab first.
 * Provisions the Matrix user account if it doesn't exist yet.
 */
export const invitePersonToGroupRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; joined: boolean }> => {
    // Group-membership management — performed by member/group admins.
    await requireRole(request, 'invitePersonToGroupRoom', ['admin', 'memberAdmin', 'groupAdmin']);

    const { groupId, personKey } = request.data as { groupId: string; personKey: string };
    requireParam(groupId, 'groupId');
    requireParam(personKey, 'personKey');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`invitePersonToGroupRoom: groupId=${groupId}, personKey=${personKey}, matrixUserId=${matrixUserId}`);

    // Step 1: Provision the Matrix user if needed
    await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });

    // Step 2: Resolve (or create) the group's room — single source of truth (fixes S5)
    const roomId = await resolveGroupRoom(groupId, hostname, adminToken, { create: true });
    if (!roomId) throw new HttpsError('internal', `No room for group ${groupId}`);

    // Step 3: Ensure admin is in the room, then force-join the person (ARCH-5 helpers)
    await ensureAdminInRoom(roomId, adminToken);
    await forceJoinUserToRoom(roomId, matrixUserId, adminToken);

    console.log(`invitePersonToGroupRoom: ${matrixUserId} joined room ${roomId}`);
    return { roomId, joined: true };
  }
);

/**
 * Remove a specific person (by personKey) from the Matrix room of a group.
 * Called when a group membership is ended so the member loses access to the group chat.
 */
export const kickPersonFromGroupRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; kicked: boolean }> => {
    // Group-membership management — performed by member/group admins.
    await requireRole(request, 'kickPersonFromGroupRoom', ['admin', 'memberAdmin', 'groupAdmin']);

    const { groupId, personKey } = request.data as { groupId: string; personKey: string };
    requireParam(groupId, 'groupId');
    requireParam(personKey, 'personKey');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`kickPersonFromGroupRoom: groupId=${groupId}, personKey=${personKey}, matrixUserId=${matrixUserId}`);

    // Step 1: Resolve the group's room (do not create — nothing to kick from if absent)
    const roomId = await resolveGroupRoom(groupId, hostname, adminToken, { create: false });
    if (!roomId) {
      console.warn(`kickPersonFromGroupRoom: No room found for group "${groupId}", nothing to kick from`);
      return { roomId: '', kicked: false };
    }

    // Step 2: Ensure admin is in the room, then kick (ARCH-5 helpers; M_NOT_IN_ROOM tolerated)
    await ensureAdminInRoom(roomId, adminToken);
    const kicked = await kickUserFromRoom(roomId, matrixUserId, adminToken, 'Membership ended');
    console.log(`kickPersonFromGroupRoom: ${matrixUserId} ${kicked ? 'kicked from' : 'was not in'} room ${roomId}`);
    return { roomId, kicked };
  }
);

/**
 * Rename an existing Matrix room for a given group.
 * Finds the room by alias (#group_<groupId>:<hostname>) or by name search,
 * ensures the admin is in the room, then updates the m.room.name state event.
 * Optionally also registers a canonical alias for the new name.
 */
export const renameMatrixRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; name: string }> => {
    const uid = await requireRole(request, 'renameMatrixRoom', ['admin']);

    // Accepts EITHER a roomId (AOC's room list, which knows no group) or a groupId. The AOC
    // room actions always send roomId; requiring groupId is what made every rename from that
    // screen fail with 400 invalid-argument.
    const { groupId, roomId: roomIdArg, name } = request.data as { groupId?: string; roomId?: string; name: string };
    requireParam(name, 'name');
    if (!groupId && !roomIdArg) throw new HttpsError('invalid-argument', 'Either roomId or groupId is required');

    const adminToken = matrixAdminToken.value();
    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');

    // Step 1: Resolve the room — given directly, or via the group (do not create)
    const roomId = roomIdArg ?? await resolveGroupRoom(groupId!, hostname, adminToken, { create: false });
    if (!roomId) throw new HttpsError('not-found', `No room found for group "${groupId}"`);

    // The AOC room list sends a raw roomId, so the group document never constrains which room
    // this reaches — gate on the room's own marker, which covers both entry shapes.
    await requireRoomInTenant(roomId, uid, 'renameMatrixRoom', adminToken);

    // Step 2: Ensure the admin is in the room (needed to send state events; ARCH-5 helper)
    await ensureAdminInRoom(roomId, adminToken);

    // Step 3: Set the room name via m.room.name state event
    const nameResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    );
    if (!nameResp.ok) {
      throw new HttpsError('internal', `Failed to rename room ${roomId}: ${await nameResp.text()}`);
    }

    console.log(`renameMatrixRoom: Room ${roomId} renamed to "${name}"`);
    return { roomId, name };
  }
);

export interface AdminRoom {
  roomId: string;
  name: string;
  canonicalAlias?: string;
  joinedMembers: number;
  creator?: string;
  public: boolean;
  /**
   * Label for a room that carries no `m.room.name` — `DM: Anna Muster ↔ Bruno Kaiser`, or
   * `Raum: …` for a nameless multi-person room. Derived for display only, NEVER written to
   * room state: a DM has no name by design (each side shows the other person), and our own
   * client treats "has a name" as "is not a DM" (isDirectRoom), so naming one would make it
   * render as a group room.
   */
  derivedName?: string;
}

/**
 * List Matrix rooms. If personKey is given, returns only rooms where that person
 * is a member. Otherwise returns all rooms in the installation (up to 1000).
 */
export const listMatrixRooms = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ rooms: AdminRoom[]; total: number }> => {
    const uid = await requireRole(request, 'listMatrixRooms', ['admin']);

    const { personKey } = request.data as { personKey?: string };
    const adminToken = matrixAdminToken.value();
    const callerTenants = await getUserTenants(uid);

    /**
     * Reduce a homeserver-global listing to what this tenant may see.
     *
     * `/_synapse/admin/v1/rooms` returns EVERY room on the homeserver, so an elab admin was
     * handed scs's full room inventory — names, aliases, member counts, creators — and the
     * room ids that every other callable in this file then accepts. Filtering here is what
     * makes those per-room gates meaningful rather than merely correct.
     *
     * Unmarked rooms are kept and flagged (see roomAdmitsTenant): they are already visible in
     * every tenant, and this listing is where an admin finds them to run the backfill.
     */
    const scopeToTenant = async (rooms: AdminRoom[]): Promise<AdminRoom[]> => {
      const markers = await getRoomTenantsBatch(rooms.map(r => r.roomId), adminToken);
      const kept = rooms.filter(r => roomAdmitsTenant(markers.get(r.roomId) ?? [], callerTenants));
      const unmarked = kept.filter(r => (markers.get(r.roomId) ?? []).length === 0).length;
      if (kept.length !== rooms.length || unmarked > 0) {
        console.warn(`listMatrixRooms: ${rooms.length} rooms on the homeserver, ${kept.length} for ${callerTenants.join(',')}, ${unmarked} unmarked`);
      }
      return kept;
    };

    // Helper: fetch all rooms from the admin API (paginated, max 1000)
    async function fetchAllRooms(): Promise<AdminRoom[]> {
      const rooms: AdminRoom[] = [];
      let from = 0;
      const limit = 100;

      while (true) {
        const resp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?limit=${limit}&from=${from}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        if (!resp.ok) throw new HttpsError('internal', `Failed to list rooms: ${await resp.text()}`);
        const data = await resp.json() as {
          rooms: Array<{ room_id: string; name: string; canonical_alias?: string; joined_members: number; creator?: string; public: boolean }>;
          next_batch?: number;
          total_rooms: number;
        };
        for (const r of data.rooms) {
          rooms.push({ roomId: r.room_id, name: r.name, canonicalAlias: r.canonical_alias, joinedMembers: r.joined_members, creator: r.creator, public: r.public });
        }
        if (!data.next_batch || rooms.length >= 1000) break;
        from = data.next_batch;
      }
      return rooms;
    }

    if (personKey) {
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;

      // Get the room IDs the user belongs to
      const joinedResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/joined_rooms`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (!joinedResp.ok) {
        if (joinedResp.status === 404) return { rooms: [], total: 0 }; // user not found
        throw new HttpsError('internal', `Failed to get joined rooms for ${matrixUserId}: ${await joinedResp.text()}`);
      }
      const { joined_rooms: joinedRoomIds } = await joinedResp.json() as { joined_rooms: string[]; total: number };
      if (joinedRoomIds.length === 0) return { rooms: [], total: 0 };

      // Fetch details for each joined room via the per-room admin endpoint
      const joinedSet = new Set(joinedRoomIds);
      const allRooms = await fetchAllRooms();
      const filtered = await scopeToTenant(allRooms.filter(r => joinedSet.has(r.roomId)));
      await addDerivedNames(filtered, adminToken);
      return { rooms: filtered, total: filtered.length };
    }

    const rooms = await scopeToTenant(await fetchAllRooms());
    await addDerivedNames(rooms, adminToken);
    return { rooms, total: rooms.length };
  }
);


/** Service/bot accounts that must not appear in a derived room label. */
const LABEL_HIDDEN_LOCALPARTS = new Set(['bk2-bot', 'baibot', 'signalbot']);

/**
 * Fill `derivedName` on every room that has no `m.room.name`, so the admin room list shows
 * "DM: Anna Muster ↔ Bruno Kaiser" instead of a blank row and an opaque room id.
 *
 * A Matrix localpart IS the person okey (lowercased), so one read of `persons` resolves every
 * member to a real name. Bridge puppets (`@signal_…`) have no person, so they fall back to their
 * Matrix profile display name — mautrix fills it with the real contact name, which turns
 * "DM: signal_9f3a-…" into "DM: Maria Gauer". Mutates `rooms` in place; failures are swallowed —
 * a missing label must never fail the list.
 */
async function addDerivedNames(rooms: AdminRoom[], adminToken: string): Promise<void> {
  const unnamed = rooms.filter(r => !r.name).slice(0, 120);
  if (!unnamed.length) return;
  try {
    const personsSnap = await getFirestore().collection('persons').get();
    const nameByKey = new Map<string, string>();
    for (const doc of personsSnap.docs) {
      const full = [doc.data()['firstName'], doc.data()['lastName']].filter(Boolean).join(' ').trim();
      if (full) nameByKey.set(doc.id.toLowerCase(), full);
    }

    // Matrix profile lookups for members that are not okr persons (bridge puppets), cached
    // per localpart because the same contact recurs across rooms.
    const profileCache = new Map<string, string>();
    const resolveProfile = async (localpart: string): Promise<string> => {
      const cached = profileCache.get(localpart);
      if (cached !== undefined) return cached;
      let label = localpart;
      try {
        const userId = `@${localpart}:${serverHostname()}`;
        const resp = await fetch(
          `${MATRIX_HOMESERVER}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        if (resp.ok) label = (await resp.json() as { displayname?: string }).displayname || localpart;
      } catch { /* keep the localpart */ }
      profileCache.set(localpart, label);
      return label;
    };

    await Promise.all(unnamed.map(async room => {
      const resp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(room.roomId)}/members`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (!resp.ok) return;
      const { members } = await resp.json() as { members: string[] };
      const localparts = members
        .map(m => m.split(':')[0].replace(/^@/, '').toLowerCase())
        .filter(localpart => !LABEL_HIDDEN_LOCALPARTS.has(localpart));
      const labels = await Promise.all(
        localparts.map(async localpart => nameByKey.get(localpart) ?? await resolveProfile(localpart))
      );
      if (!labels.length) return;
      room.derivedName = labels.length <= 2
        ? `DM: ${labels.join(' ↔ ')}`
        : `Raum: ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ` (+${labels.length - 3})` : ''}`;
    }));
  } catch (err) {
    console.warn('addDerivedNames: could not derive room labels:', err);
  }
}

export interface RoomDetails {
  id: string;
  name: string;
  normalizedName: string;
  isDirect: boolean;        // always false server-side; DM info lives in client account data
  isPublic: boolean;
  creator: string;
  avatarUrl?: string;
  aliases: string[];
  topic?: string;
  numberOfJoinedMembers: number;
  numberOfInvitedMembers: number;
}

export interface RoomMemberInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  membership: string;
  powerLevel: number;
}

export interface MemberDetails {
  userId: string;
  name: string;
  rawDisplayName: string;
  powerLevel: number;       // 0 when no roomId provided
  membership?: string;      // only available when roomId provided
  avatarUrl?: string;
}

/**
 * Return details for a single Matrix room.
 * Combines the admin rooms endpoint with the room state to populate all fields.
 */
export const getRoomDetails = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<RoomDetails> => {
    const uid = await requireRole(request, 'getRoomDetails', ['admin']);
    const { roomId } = request.data as { roomId: string };
    requireParam(roomId, 'roomId');

    const adminToken = matrixAdminToken.value();
    await requireRoomInTenant(roomId, uid, 'getRoomDetails', adminToken);

    // Basic room info
    const infoResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!infoResp.ok) throw new HttpsError('not-found', `Room not found: ${await infoResp.text()}`);
    const info = await infoResp.json() as {
      room_id: string; name: string; canonical_alias?: string;
      joined_members: number; creator: string; public: boolean;
    };

    // Room state events — avatar, topic, aliases, invited member count
    const stateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    let avatarUrl: string | undefined;
    let topic: string | undefined;
    const aliases: string[] = [];
    let numberOfInvitedMembers = 0;

    if (stateResp.ok) {
      const stateData = await stateResp.json() as { state: Array<{ type: string; state_key: string; content: Record<string, unknown> }> };
      for (const event of stateData.state ?? []) {
        if (event.type === 'm.room.avatar' && event.state_key === '') avatarUrl = event.content['url'] as string | undefined;
        if (event.type === 'm.room.topic' && event.state_key === '') topic = event.content['topic'] as string | undefined;
        if (event.type === 'm.room.aliases') aliases.push(...((event.content['aliases'] as string[]) ?? []));
        if (event.type === 'm.room.member' && event.content['membership'] === 'invite') numberOfInvitedMembers++;
      }
      if (info.canonical_alias && !aliases.includes(info.canonical_alias)) aliases.unshift(info.canonical_alias);
    }

    return {
      id: info.room_id,
      name: info.name ?? '',
      normalizedName: (info.name ?? '').toLowerCase().trim(),
      isDirect: false,
      isPublic: info.public ?? false,
      creator: info.creator ?? '',
      avatarUrl,
      aliases,
      topic,
      numberOfJoinedMembers: info.joined_members ?? 0,
      numberOfInvitedMembers,
    };
  }
);

/**
 * Return all members of a Matrix room with their display name, avatar,
 * membership status, and power level — all derived from room state in one request.
 */
export const getAllMembersFromRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ members: RoomMemberInfo[]; total: number }> => {
    const uid = await requireRole(request, 'getAllMembersFromRoom', ['admin']);
    const { roomId } = request.data as { roomId: string };
    requireParam(roomId, 'roomId');

    const adminToken = matrixAdminToken.value();
    await requireRoomInTenant(roomId, uid, 'getAllMembersFromRoom', adminToken);
    const stateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!stateResp.ok) throw new HttpsError('internal', `Failed to get room state: ${await stateResp.text()}`);

    const stateData = await stateResp.json() as { state: Array<{ type: string; state_key: string; content: Record<string, unknown> }> };
    const events = stateData.state ?? [];

    // Extract power levels (single event, state_key = '')
    const powerEvent = events.find(e => e.type === 'm.room.power_levels' && e.state_key === '');
    const userPowerLevels = (powerEvent?.content?.['users'] ?? {}) as Record<string, number>;
    const defaultPowerLevel = (powerEvent?.content?.['users_default'] ?? 0) as number;

    // Build member list from m.room.member state events
    const members: RoomMemberInfo[] = events
      .filter(e => e.type === 'm.room.member' && ['join', 'invite', 'ban'].includes(e.content['membership'] as string))
      .map(e => ({
        userId: e.state_key,
        displayName: (e.content['displayname'] as string | undefined) ?? e.state_key.split(':')[0].substring(1),
        avatarUrl: (e.content['avatar_url'] as string | undefined),
        membership: (e.content['membership'] as string),
        powerLevel: userPowerLevels[e.state_key] ?? defaultPowerLevel,
      }));

    return { members, total: members.length };
  }
);

/**
 * Return profile details for a Matrix user.
 * If roomId is also provided, the power level and membership are resolved from that room's state.
 */
export const getMemberDetails = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<MemberDetails> => {
    const uid = await requireRole(request, 'getMemberDetails', ['admin']);
    const { userId, roomId } = request.data as { userId: string; roomId?: string };
    requireParam(userId, 'userId');

    const adminToken = matrixAdminToken.value();
    // Only the room-scoped half needs a gate: the profile itself is a person's display name
    // and avatar, and persons are deliberately shared across tenants. The power level and
    // membership below, however, are room state.
    if (roomId) await requireRoomInTenant(roomId, uid, 'getMemberDetails', adminToken);

    // User profile from admin API
    const userResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!userResp.ok) throw new HttpsError('not-found', `User not found: ${await userResp.text()}`);
    const user = await userResp.json() as { displayname?: string; avatar_url?: string };
    const displayName = user.displayname ?? userId.split(':')[0].substring(1);

    // Room-specific data (power level and membership) — only if roomId provided
    let powerLevel = 0;
    let membership: string | undefined;

    if (roomId) {
      const stateResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (stateResp.ok) {
        const stateData = await stateResp.json() as { state: Array<{ type: string; state_key: string; content: Record<string, unknown> }> };
        const events = stateData.state ?? [];
        const powerEvent = events.find(e => e.type === 'm.room.power_levels' && e.state_key === '');
        const userPowerLevels = (powerEvent?.content?.['users'] ?? {}) as Record<string, number>;
        const defaultPowerLevel = (powerEvent?.content?.['users_default'] ?? 0) as number;
        powerLevel = userPowerLevels[userId] ?? defaultPowerLevel;
        const memberEvent = events.find(e => e.type === 'm.room.member' && e.state_key === userId);
        membership = memberEvent?.content?.['membership'] as string | undefined;
      }
    }

    return {
      userId,
      name: displayName,
      rawDisplayName: displayName,
      powerLevel,
      membership,
      avatarUrl: user.avatar_url,
    };
  }
);

/**
 * Delete (purge) a Matrix room by its room ID.
 * Kicks all members, removes the room from all local users' room lists,
 * and purges all events from the Synapse database.
 * The deletion runs asynchronously on Synapse; this function returns the delete_id.
 */
export const deleteMatrixRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ deleteId: string }> => {
    const uid = await requireRole(request, 'deleteMatrixRoom', ['admin']);

    const { roomId } = request.data as { roomId: string };
    requireParam(roomId, 'roomId');

    const adminToken = matrixAdminToken.value();
    // The most destructive callable in this file: DELETE + purge is irreversible, and the
    // Synapse admin API is homeserver-global. Without this, an admin of one tenant could
    // destroy another tenant's chat history.
    await requireRoomInTenant(roomId, uid, 'deleteMatrixRoom', adminToken);

    console.log(`deleteMatrixRoom: deleting room ${roomId}`);

    // Synapse removed `POST /_synapse/admin/v1/rooms/<id>/delete` — it answers M_UNRECOGNIZED
    // ("Unrecognized request", HTTP 404), which this function reported as a bare 500. The
    // replacement is the async v2 endpoint; it returns a delete_id to poll, same as before.
    const deleteResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block: false,
          purge: true,
          message: 'Room deleted by administrator',
        }),
      }
    );

    if (!deleteResp.ok) {
      throw new HttpsError('internal', `Failed to delete room ${roomId}: ${await deleteResp.text()}`);
    }

    const data = await deleteResp.json() as { delete_id: string };
    console.log(`deleteMatrixRoom: room ${roomId} queued for deletion (delete_id=${data.delete_id})`);
    return { deleteId: data.delete_id };
  }
);

/**
 * Add a local room alias to a Matrix room.
 * The alias will be in the form #aliasName:homeserver
 */
export const addMatrixRoomAlias = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ alias: string }> => {
    const uid = await requireRole(request, 'addMatrixRoomAlias', ['admin']);

    const { roomId, aliasName } = request.data as { roomId: string; aliasName: string };
    requireParam(roomId, 'roomId');
    requireParam(aliasName, 'aliasName');

    await requireRoomInTenant(roomId, uid, 'addMatrixRoomAlias', matrixAdminToken.value());

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    // Sanitise: lowercase, replace spaces with hyphens, strip disallowed chars
    const sanitised = aliasName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.\-]/g, '');
    const fullAlias = `#${sanitised}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`addMatrixRoomAlias: adding alias ${fullAlias} to room ${roomId}`);

    const resp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(fullAlias)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      }
    );

    if (!resp.ok) {
      throw new HttpsError('internal', `Failed to add alias ${fullAlias} to room ${roomId}: ${await resp.text()}`);
    }

    console.log(`addMatrixRoomAlias: alias ${fullAlias} added to room ${roomId}`);
    return { alias: fullAlias };
  }
);

/**
 * Lock a kiosk call room down so that only admins can ring the kiosk device.
 *
 * A kiosk device answers incoming calls automatically (it is unattended, nobody can tap
 * "answer"), so "who may call it" is a security boundary, not a UI preference. The client-side
 * check in MatrixCallService is defence in depth; THIS is the enforcement: the homeserver
 * rejects an `m.call.invite` from anyone below power level 100, so a non-admin member of the
 * room — or a tampered client — cannot make the kiosk's camera and microphone go live.
 *
 * Idempotent: run it again after adding an admin. Existing power levels are merged, so any
 * unrelated per-user levels the room already carries survive.
 */
export const setKioskCallRoomPolicy = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; adminUserIds: string[] }> => {
    const uid = await requireRole(request, 'setKioskCallRoomPolicy', ['admin']);

    const { roomId, adminPersonKeys, kioskPersonKey } = request.data as {
      roomId: string;
      adminPersonKeys: string[];
      kioskPersonKey: string;
    };
    requireParam(roomId, 'roomId');
    requireParam(kioskPersonKey, 'kioskPersonKey');
    if (!Array.isArray(adminPersonKeys) || adminPersonKeys.length === 0) {
      throw new HttpsError('invalid-argument', 'adminPersonKeys must be a non-empty array');
    }

    const hostname = serverHostname();
    const adminToken = matrixAdminToken.value();
    await requireRoomInTenant(roomId, uid, 'setKioskCallRoomPolicy', adminToken);

    const mxid = (personKey: string) => `@${personKey.toLowerCase()}:${hostname}`;
    const adminUserIds = adminPersonKeys.map(key => mxid(requireParam(key, 'adminPersonKey')));

    await ensureAdminInRoom(roomId, adminToken);

    // Merge into the room's current power levels rather than overwriting them.
    const stateUrl = `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels/`;
    const currentResp = await fetch(stateUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
    const current = currentResp.ok
      ? await currentResp.json() as { users?: Record<string, number>; events?: Record<string, number> }
      : {};

    const users: Record<string, number> = { ...current.users };
    for (const userId of adminUserIds) users[userId] = KIOSK_ADMIN_POWER_LEVEL;
    // The kiosk itself is a passive endpoint: it may talk, never invite, kick or call out.
    users[mxid(kioskPersonKey)] = 0;

    const body = {
      ...current,
      users,
      events: {
        ...current.events,
        // the actual gate — everything below is consistency, this line is the control
        'm.call.invite': KIOSK_ADMIN_POWER_LEVEL,
        'm.call.candidates': KIOSK_ADMIN_POWER_LEVEL,
        'm.room.power_levels': KIOSK_ADMIN_POWER_LEVEL,
      },
      invite: KIOSK_ADMIN_POWER_LEVEL,
      kick: KIOSK_ADMIN_POWER_LEVEL,
      ban: KIOSK_ADMIN_POWER_LEVEL,
    };

    const resp = await fetch(stateUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new HttpsError('internal', `Failed to set kiosk call policy on ${roomId}: ${await resp.text()}`);
    }

    console.log(`setKioskCallRoomPolicy: ${roomId} locked to ${adminUserIds.join(', ')}`);
    return { roomId, adminUserIds };
  }
);
