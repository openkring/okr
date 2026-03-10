/**
 * Simple Token Exchange for Matrix Authentication
 * 
 * This is a simpler alternative to the full OIDC bridge.
 * Instead of implementing a full OAuth/OIDC provider, this approach:
 * 
 * 1. User authenticates with Firebase (any method: email, phone, Google, etc.)
 * 2. App calls this function with Firebase ID token
 * 3. Function validates token and creates Matrix session via admin API
 * 4. Function returns Matrix credentials
 * 5. App uses Matrix credentials directly
 * 
 * Pros:
 * - Much simpler implementation.
 * - No OIDC complexity
 * - Supports all Firebase auth methods
 * - More reliable (fewer moving parts)
 * 
 * Cons:
 * - Matrix doesn't handle auth directly (app does)
 * - Need to manage token refresh in app
 * - Not using Matrix's native SSO capabilities
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { defineSecret } from 'firebase-functions/params';

const matrixAdminToken = defineSecret('MATRIX_ADMIN_TOKEN');
const MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER || 'https://matrix.bkchat.etke.host';

/**
 * Resolve the Matrix user localpart for a Firebase UID.
 * Uses Person.bkey (via users/{uid}.personKey) which is consistent across
 * all chat scenarios (group chat, direct chat, chat overview).
 * Falls back to the Firebase UID if the Firestore lookup fails.
 */
async function getMatrixLocalpart(firebaseUid: string): Promise<string> {
  try {
    const doc = await getFirestore().collection('users').doc(firebaseUid).get();
    const personKey = doc.data()?.personKey as string | undefined;
    return personKey ? personKey.toLowerCase() : firebaseUid.toLowerCase();
  } catch {
    return firebaseUid.toLowerCase();
  }
}

export interface MatrixAuthResponse {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

/**
 * Simple Firebase -> Matrix Token Exchange
 * 
 * Call this from your app after Firebase authentication
 */
export const getMatrixCredentials = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<MatrixAuthResponse> => {
    try {
      // Get Firebase ID token from request context
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new Error('Not authenticated with Firebase');
      }

      // Get full user record from Firebase
      const userRecord = await getAuth().getUser(firebaseUid);

      console.log(`Getting Matrix credentials for Firebase user: ${firebaseUid}`);

      // Derive Matrix user ID from Person.bkey (consistent across all chat scenarios)
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      const localpart = await getMatrixLocalpart(firebaseUid);
      const matrixUserId = `@${localpart}:${hostname}`;

      // Check if Matrix user exists
      let matrixUserExists = false;
      try {
        const checkUserResponse = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${matrixUserId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${matrixAdminToken.value()}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (checkUserResponse.ok) {
          matrixUserExists = true;
          console.log(`Matrix user ${matrixUserId} already exists`);
        }
      } catch (error) {
        console.log(`Matrix user ${matrixUserId} does not exist, will create`);
      }

      // Create Matrix user if doesn't exist
      if (!matrixUserExists) {
        const displayName = userRecord.displayName || userRecord.email?.split('@')[0] || firebaseUid;
        
        const createUserResponse = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${matrixUserId}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${matrixAdminToken.value()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              displayname: displayName,
              avatar_url: userRecord.photoURL || undefined,
              admin: false,
              deactivated: false,
            }),
          }
        );

        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text();
          throw new Error(`Failed to create Matrix user: ${errorText}`);
        }

        console.log(`Created Matrix user: ${matrixUserId}`);
      }

      // Generate Matrix access token for the user
      // Note: This requires Synapse admin API to generate tokens
      const loginResponse = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${matrixUserId}/login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${matrixAdminToken.value()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valid_until_ms: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
          }),
        }
      );

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Failed to generate Matrix access token: ${errorText}`);
      }

      const loginData = await loginResponse.json() as {
        access_token: string;
      };

      console.log(`Generated Matrix access token for ${matrixUserId}`);

      // Update user profile in Matrix (in case it changed in Firebase)
      if (userRecord.displayName || userRecord.photoURL) {
        try {
          // Update display name
          if (userRecord.displayName) {
            await fetch(
              `${MATRIX_HOMESERVER}/_matrix/client/v3/profile/${matrixUserId}/displayname`,
              {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${loginData.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  displayname: userRecord.displayName,
                }),
              }
            );
          }

          // Update avatar
          if (userRecord.photoURL) {
            // Note: This would require uploading the avatar to Matrix media repo first
            // For now, we skip this step
          }
        } catch (error) {
          console.warn('Failed to update Matrix profile:', error);
          // Non-fatal error, continue
        }
      }

      return {
        accessToken: loginData.access_token,
        userId: matrixUserId,
        deviceId: `firebase_${firebaseUid}`,
        homeserverUrl: MATRIX_HOMESERVER,
      };
    } catch (error) {
      console.error('Error getting Matrix credentials:', error);
      throw error;
    }
  }
);

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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');
    const { name } = request.data as { name: string };
    if (!name) throw new Error('name is required');

    const adminToken = matrixAdminToken.value();
    const searchResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(name)}&limit=20`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!searchResp.ok) {
      throw new Error(`Room search failed: ${await searchResp.text()}`);
    }
    const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
    const exact = data.rooms?.find(r => r.name === name);
    if (!exact) {
      throw new Error(`No room found with name "${name}"`);
    }
    return { roomId: exact.room_id };
  }
);

export const requestGroupRoomAccess = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; joined: boolean }> => {
    const firebaseUid = request.auth?.uid;
    if (!firebaseUid) {
      throw new Error('Not authenticated with Firebase');
    }

    const { groupId } = request.data as { groupId: string };
    if (!groupId) {
      throw new Error('groupId is required');
    }

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const localpart = await getMatrixLocalpart(firebaseUid);
    const matrixUserId = `@${localpart}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`requestGroupRoomAccess: uid=${firebaseUid}, matrixUserId=${matrixUserId}, groupId=${groupId}`);

    // Step 1: Find the room — try canonical alias first, then name search
    let roomId: string | undefined;

    const roomAlias = `#group_${groupId}:${hostname}`;
    try {
      const aliasResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (aliasResp.ok) {
        const data = await aliasResp.json() as { room_id: string };
        roomId = data.room_id;
        console.log(`requestGroupRoomAccess: Found room by alias: ${roomId}`);
      }
    } catch { /* alias not found, fall through to name search */ }

    if (!roomId) {
      const searchResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(groupId)}&limit=20`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (searchResp.ok) {
        const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
        const match = data.rooms?.find(r => r.name === groupId);
        if (match) {
          roomId = match.room_id;
          console.log(`requestGroupRoomAccess: Found room by name search: ${roomId}`);
        }
      }
    }

    // Step 2: Create room if still not found
    if (!roomId) {
      console.log(`requestGroupRoomAccess: Room not found for group ${groupId}, creating`);
      const createResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupId,
            room_alias_name: `group_${groupId}`,
            // public join_rules so the Synapse admin API can force-join users without
            // needing the admin to be a room member first (private/invite rooms block this).
            // m.federate:false keeps the room local to this homeserver only.
            preset: 'public_chat',
            visibility: 'private',
            creation_content: { 'm.federate': false },
          }),
        }
      );
      if (!createResp.ok) {
        throw new Error(`Failed to create room for group ${groupId}: ${await createResp.text()}`);
      }
      const data = await createResp.json() as { room_id: string };
      roomId = data.room_id;
      console.log(`requestGroupRoomAccess: Created new room: ${roomId}`);
    }

    // Step 3a: Ensure the admin is in the room before joining the target user.
    // For private (invite-only) rooms the Synapse admin join endpoint requires the
    // admin account to already be a member before it can add a third-party user.
    // Joining the admin themselves is always allowed by the admin API.
    const whoamiResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (whoamiResp.ok) {
      const { user_id: adminUserId } = await whoamiResp.json() as { user_id: string };
      if (adminUserId) {
        const adminJoinResp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: adminUserId }),
          }
        );
        if (!adminJoinResp.ok) {
          console.warn(`requestGroupRoomAccess: Could not join admin ${adminUserId} to room ${roomId}: ${await adminJoinResp.text()}`);
        } else {
          console.log(`requestGroupRoomAccess: Admin ${adminUserId} joined room ${roomId}`);
        }
      }
    }

    // Step 3b: Force-join the target user via Synapse admin API.
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
      console.error(`requestGroupRoomAccess: Admin join failed for ${matrixUserId} in room ${roomId}: ${errText}`);
      throw new Error(`Room access denied for group ${groupId}: ${errText}`);
    }

    console.log(`requestGroupRoomAccess: User ${matrixUserId} joined room ${roomId} for group ${groupId}`);
    return { roomId, joined: true };
  }
);

/**
 * Provision a Matrix account for a target user by their Person.bkey (personKey).
 * Called when the current user wants to start a direct chat with someone who
 * hasn't logged in yet and therefore has no Matrix account.
 * Uses the Synapse admin API, so no password or login from the target user is needed.
 */
export const provisionMatrixUser = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');
    const { personKey } = request.data as { personKey: string };
    if (!personKey) throw new Error('personKey is required');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    // Check if the user already exists
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (checkResp.ok) {
      const checkData = await checkResp.json() as { deactivated?: boolean };
      if (checkData.deactivated) {
        console.log(`provisionMatrixUser: ${matrixUserId} exists but is deactivated — reactivating`);
        const reactivateResp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ deactivated: false }),
          }
        );
        if (!reactivateResp.ok) {
          throw new Error(`Failed to reactivate ${matrixUserId}: ${await reactivateResp.text()}`);
        }
        console.log(`provisionMatrixUser: ${matrixUserId} reactivated`);
      } else {
        console.log(`provisionMatrixUser: ${matrixUserId} already exists and is active`);
      }
      return { matrixUserId };
    }
    console.log(`provisionMatrixUser: ${matrixUserId} not found (status=${checkResp.status}), creating...`);

    // Resolve a display name from the persons Firestore doc
    let displayName = personKey;
    try {
      const doc = await getFirestore().collection('persons').doc(personKey).get();
      const d = doc.data();
      if (d) {
        const fullName = [d['firstName'], d['lastName']].filter(Boolean).join(' ');
        if (fullName) displayName = fullName;
      }
    } catch { /* fallback to personKey */ }

    // Create the Matrix user via admin API (no password required)
    const createResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayname: displayName, admin: false, deactivated: false }),
      }
    );
    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error(`Failed to provision Matrix user ${matrixUserId}: ${errText}`);
    }

    console.log(`provisionMatrixUser: Created Matrix user ${matrixUserId} (${displayName})`);
    return { matrixUserId };
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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; joined: boolean }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { groupId, personKey } = request.data as { groupId: string; personKey: string };
    if (!groupId) throw new Error('groupId is required');
    if (!personKey) throw new Error('personKey is required');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`invitePersonToGroupRoom: groupId=${groupId}, personKey=${personKey}, matrixUserId=${matrixUserId}`);

    // Step 1: Provision the Matrix user if needed
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!checkResp.ok) {
      let displayName = personKey;
      try {
        const doc = await getFirestore().collection('persons').doc(personKey).get();
        const d = doc.data();
        if (d) {
          const full = [d['firstName'], d['lastName']].filter(Boolean).join(' ');
          if (full) displayName = full;
        }
      } catch { /* fallback */ }
      const createResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayname: displayName, admin: false, deactivated: false }),
        }
      );
      if (!createResp.ok) {
        throw new Error(`Failed to provision Matrix user ${matrixUserId}: ${await createResp.text()}`);
      }
      console.log(`invitePersonToGroupRoom: Provisioned Matrix user ${matrixUserId}`);
    }

    // Step 2: Find the room by alias, then by name search
    let roomId: string | undefined;
    const roomAlias = `#group_${groupId}:${hostname}`;
    try {
      const aliasResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (aliasResp.ok) {
        roomId = (await aliasResp.json() as { room_id: string }).room_id;
      }
    } catch { /* fall through */ }

    if (!roomId) {
      const searchResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(groupId)}&limit=20`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (searchResp.ok) {
        const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
        const match = data.rooms?.find(r => r.name === groupId);
        if (match) roomId = match.room_id;
      }
    }

    if (!roomId) {
      // Room doesn't exist yet — create it
      const createResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupId,
            room_alias_name: `group_${groupId}`,
            preset: 'public_chat',
            visibility: 'private',
            creation_content: { 'm.federate': false },
          }),
        }
      );
      if (!createResp.ok) {
        throw new Error(`Failed to create room for group ${groupId}: ${await createResp.text()}`);
      }
      roomId = (await createResp.json() as { room_id: string }).room_id;
      console.log(`invitePersonToGroupRoom: Created room ${roomId} for group ${groupId}`);
    }

    // Step 3: Ensure admin is in the room, then force-join the person
    const whoamiResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (whoamiResp.ok) {
      const { user_id: adminUserId } = await whoamiResp.json() as { user_id: string };
      if (adminUserId) {
        await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: adminUserId }),
          }
        );
      }
    }

    const joinResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: matrixUserId }),
      }
    );
    if (!joinResp.ok) {
      throw new Error(`Failed to join ${matrixUserId} to room ${roomId}: ${await joinResp.text()}`);
    }

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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; kicked: boolean }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { groupId, personKey } = request.data as { groupId: string; personKey: string };
    if (!groupId) throw new Error('groupId is required');
    if (!personKey) throw new Error('personKey is required');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`kickPersonFromGroupRoom: groupId=${groupId}, personKey=${personKey}, matrixUserId=${matrixUserId}`);

    // Step 1: Find the room by alias, then by name search
    let roomId: string | undefined;
    const roomAlias = `#group_${groupId}:${hostname}`;
    try {
      const aliasResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (aliasResp.ok) {
        roomId = (await aliasResp.json() as { room_id: string }).room_id;
      }
    } catch { /* fall through */ }

    if (!roomId) {
      const searchResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(groupId)}&limit=20`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (searchResp.ok) {
        const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
        const match = data.rooms?.find(r => r.name === groupId);
        if (match) roomId = match.room_id;
      }
    }

    if (!roomId) {
      console.warn(`kickPersonFromGroupRoom: No room found for group "${groupId}", nothing to kick from`);
      return { roomId: '', kicked: false };
    }

    // Step 2: Ensure admin is in the room (needed to send kick event)
    const whoamiResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (whoamiResp.ok) {
      const { user_id: adminUserId } = await whoamiResp.json() as { user_id: string };
      if (adminUserId) {
        await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: adminUserId }),
          }
        );
      }
    }

    // Step 3: Kick the user from the room
    const kickResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: matrixUserId, reason: 'Membership ended' }),
      }
    );
    if (!kickResp.ok) {
      const errText = await kickResp.text();
      // M_NOT_IN_ROOM is not an error — the user might have already left
      if (errText.includes('M_NOT_IN_ROOM') || errText.includes('not in room')) {
        console.log(`kickPersonFromGroupRoom: ${matrixUserId} was not in room ${roomId}, nothing to do`);
        return { roomId, kicked: false };
      }
      throw new Error(`Failed to kick ${matrixUserId} from room ${roomId}: ${errText}`);
    }

    console.log(`kickPersonFromGroupRoom: Kicked ${matrixUserId} from room ${roomId}`);
    return { roomId, kicked: true };
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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; name: string }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { groupId, name } = request.data as { groupId: string; name: string };
    if (!groupId) throw new Error('groupId is required');
    if (!name) throw new Error('name is required');

    const adminToken = matrixAdminToken.value();
    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');

    // Step 1: Find the room by alias, then fall back to name search
    let roomId: string | undefined;

    const roomAlias = `#group_${groupId}:${hostname}`;
    try {
      const aliasResp = await fetch(
        `${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (aliasResp.ok) {
        roomId = (await aliasResp.json() as { room_id: string }).room_id;
        console.log(`renameMatrixRoom: Found room by alias: ${roomId}`);
      }
    } catch { /* fall through to name search */ }

    if (!roomId) {
      const searchResp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?search_term=${encodeURIComponent(groupId)}&limit=20`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (searchResp.ok) {
        const data = await searchResp.json() as { rooms: Array<{ room_id: string; name: string }> };
        const match = data.rooms?.find(r => r.name === groupId);
        if (match) {
          roomId = match.room_id;
          console.log(`renameMatrixRoom: Found room by name search: ${roomId}`);
        }
      }
    }

    if (!roomId) throw new Error(`No room found for group "${groupId}"`);

    // Step 2: Ensure the admin is in the room (needed to send state events)
    const whoamiResp = await fetch(
      `${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (whoamiResp.ok) {
      const { user_id: adminUserId } = await whoamiResp.json() as { user_id: string };
      if (adminUserId) {
        const adminJoinResp = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: adminUserId }),
          }
        );
        if (!adminJoinResp.ok) {
          console.warn(`renameMatrixRoom: Could not join admin to room: ${await adminJoinResp.text()}`);
        }
      }
    }

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
      throw new Error(`Failed to rename room ${roomId}: ${await nameResp.text()}`);
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
}

/**
 * List Matrix rooms. If personKey is given, returns only rooms where that person
 * is a member. Otherwise returns all rooms in the installation (up to 1000).
 */
export const listMatrixRooms = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ rooms: AdminRoom[]; total: number }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { personKey } = request.data as { personKey?: string };
    const adminToken = matrixAdminToken.value();

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
        if (!resp.ok) throw new Error(`Failed to list rooms: ${await resp.text()}`);
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
        throw new Error(`Failed to get joined rooms for ${matrixUserId}: ${await joinedResp.text()}`);
      }
      const { joined_rooms: joinedRoomIds } = await joinedResp.json() as { joined_rooms: string[]; total: number };
      if (joinedRoomIds.length === 0) return { rooms: [], total: 0 };

      // Fetch details for each joined room via the per-room admin endpoint
      const joinedSet = new Set(joinedRoomIds);
      const allRooms = await fetchAllRooms();
      const filtered = allRooms.filter(r => joinedSet.has(r.roomId));
      return { rooms: filtered, total: filtered.length };
    }

    const rooms = await fetchAllRooms();
    return { rooms, total: rooms.length };
  }
);

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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<RoomDetails> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');
    const { roomId } = request.data as { roomId: string };
    if (!roomId) throw new Error('roomId is required');

    const adminToken = matrixAdminToken.value();

    // Basic room info
    const infoResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!infoResp.ok) throw new Error(`Room not found: ${await infoResp.text()}`);
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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ members: RoomMemberInfo[]; total: number }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');
    const { roomId } = request.data as { roomId: string };
    if (!roomId) throw new Error('roomId is required');

    const adminToken = matrixAdminToken.value();
    const stateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!stateResp.ok) throw new Error(`Failed to get room state: ${await stateResp.text()}`);

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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<MemberDetails> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');
    const { userId, roomId } = request.data as { userId: string; roomId?: string };
    if (!userId) throw new Error('userId is required');

    const adminToken = matrixAdminToken.value();

    // User profile from admin API
    const userResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!userResp.ok) throw new Error(`User not found: ${await userResp.text()}`);
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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ deleteId: string }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { roomId } = request.data as { roomId: string };
    if (!roomId) throw new Error('roomId is required');

    const adminToken = matrixAdminToken.value();

    console.log(`deleteMatrixRoom: deleting room ${roomId}`);

    const deleteResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/delete`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block: false,
          purge: true,
          message: 'Room deleted by administrator',
        }),
      }
    );

    if (!deleteResp.ok) {
      throw new Error(`Failed to delete room ${roomId}: ${await deleteResp.text()}`);
    }

    const data = await deleteResp.json() as { delete_id: string };
    console.log(`deleteMatrixRoom: room ${roomId} queued for deletion (delete_id=${data.delete_id})`);
    return { deleteId: data.delete_id };
  }
);

/**
 * Deactivate a Matrix user by their personKey.
 * Deactivation prevents the user from logging in and optionally erases all their
 * messages and media from the Synapse database.
 * Note: Synapse does not hard-delete users; deactivation is the canonical "delete" operation.
 */
export const deactivateMatrixUser = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string; deactivated: boolean }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { personKey, erase = false } = request.data as { personKey: string; erase?: boolean };
    if (!personKey) throw new Error('personKey is required');

    const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
    const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;
    const adminToken = matrixAdminToken.value();

    console.log(`deactivateMatrixUser: deactivating ${matrixUserId} (erase=${erase})`);

    // Check the user exists before attempting deactivation
    const checkResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (!checkResp.ok) {
      console.warn(`deactivateMatrixUser: user ${matrixUserId} not found, nothing to deactivate`);
      return { matrixUserId, deactivated: false };
    }

    const deactivateResp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/deactivate/${encodeURIComponent(matrixUserId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erase }),
      }
    );

    if (!deactivateResp.ok) {
      throw new Error(`Failed to deactivate ${matrixUserId}: ${await deactivateResp.text()}`);
    }

    console.log(`deactivateMatrixUser: ${matrixUserId} deactivated (erase=${erase})`);
    return { matrixUserId, deactivated: true };
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
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ alias: string }> => {
    if (!request.auth?.uid) throw new Error('Not authenticated');

    const { roomId, aliasName } = request.data as { roomId: string; aliasName: string };
    if (!roomId) throw new Error('roomId is required');
    if (!aliasName) throw new Error('aliasName is required');

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
      throw new Error(`Failed to add alias ${fullAlias} to room ${roomId}: ${await resp.text()}`);
    }

    console.log(`addMatrixRoomAlias: alias ${fullAlias} added to room ${roomId}`);
    return { alias: fullAlias };
  }
);

/**
 * Sync Firebase profile to Matrix
 *
 * Call this when user updates their profile in Firebase
 */
export const syncFirebaseProfileToMatrix = onCall(
  {
    cors: true,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ success: boolean }> => {
    try {
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new Error('Not authenticated with Firebase');
      }

      const userRecord = await getAuth().getUser(firebaseUid);
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      const localpart = await getMatrixLocalpart(firebaseUid);
      const matrixUserId = `@${localpart}:${hostname}`;

      // First, get Matrix access token for the user
      const loginResponse = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${matrixUserId}/login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${matrixAdminToken.value()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valid_until_ms: Date.now() + (1000 * 60 * 5), // 5 minutes (just for syncing)
          }),
        }
      );

      if (!loginResponse.ok) {
        throw new Error('Failed to get Matrix access token for profile sync');
      }

      const { access_token } = await loginResponse.json() as { access_token: string };

      // Update display name
      if (userRecord.displayName) {
        await fetch(
          `${MATRIX_HOMESERVER}/_matrix/client/v3/profile/${matrixUserId}/displayname`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              displayname: userRecord.displayName,
            }),
          }
        );
      }

      console.log(`Synced Firebase profile to Matrix for ${matrixUserId}`);

      return { success: true };
    } catch (error) {
      console.error('Error syncing profile to Matrix:', error);
      throw error;
    }
  }
);

/**
 * Send an FCM push notification to all room members when a video call is started.
 * Called by the caller's client right after placing the call.
 *
 * Input: { roomId, roomName, callerName, calleeMatrixUserIds: string[] }
 * Each Matrix user ID has the form @personKey:homeserver.
 * The CF extracts the personKey, looks up the Firebase UID in Firestore,
 * then sends a high-priority FCM message to every registered device.
 */
export const sendCallNotification = onCall(
  { cors: true, region: 'europe-west6' },
  async (request): Promise<{ sent: number }> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { roomId, roomName, callerName, calleeMatrixUserIds } = request.data as {
      roomId: string;
      roomName: string;
      callerName: string;
      calleeMatrixUserIds: string[];
    };

    if (!Array.isArray(calleeMatrixUserIds) || calleeMatrixUserIds.length === 0) {
      return { sent: 0 };
    }

    const db = getFirestore();

    // Collect { uid, token } pairs for all callees
    const tokenEntries: { uid: string; token: string }[] = [];

    for (const matrixUserId of calleeMatrixUserIds) {
      // @personKey:homeserver → personKey
      const personKey = matrixUserId.replace(/^@/, '').split(':')[0];
      const usersSnap = await db.collection('users').where('personKey', '==', personKey).limit(1).get();
      if (usersSnap.empty) continue;

      const uid = usersSnap.docs[0].id;
      const tokensSnap = await db.collection('users').doc(uid).collection('fcmTokens').get();
      for (const tokenDoc of tokensSnap.docs) {
        const token = tokenDoc.data()['token'] as string | undefined;
        if (token) tokenEntries.push({ uid, token });
      }
    }

    if (tokenEntries.length === 0) return { sent: 0 };

    // Build the deep-link URL: navigate to the chat page for this room.
    // Convention: room name "Notfall" → page id "notfall_chat" → /private/notfall_chat
    // ?selectedRoom passes the Matrix room ID directly so the right room is pre-selected.
    const chatPageId = (roomName ?? '').toLowerCase().replace(/\s+/g, '_') + '_chat';
    const chatUrl = `/private/${chatPageId}?selectedRoom=${encodeURIComponent(roomId)}`;

    const tokens = tokenEntries.map(e => e.token);
    // Data-only message (no notification field): ensures the service worker's
    // onBackgroundMessage handler is always called on web. When notification is
    // present, some browsers auto-display it and skip the SW handler entirely.
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        type: 'video-call',
        title: `📹 Video-Anruf von ${callerName}`,
        body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
        roomId,
        roomName: roomName ?? '',
        callerName: callerName ?? '',
        url: chatUrl,
      },
      android: {
        priority: 'high',
      },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'background' },
        payload: { aps: { badge: 1, 'content-available': 1 } },
      },
    });

    // Remove tokens that are no longer registered to avoid future failures
    const staleTokenDeletions: Promise<unknown>[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        const { uid, token } = tokenEntries[i];
        const tokenDocId = token.substring(0, 128);
        staleTokenDeletions.push(
          db.collection('users').doc(uid).collection('fcmTokens').doc(tokenDocId).delete()
            .catch(err => console.warn('sendCallNotification: Failed to delete stale token:', err))
        );
      }
    });
    await Promise.all(staleTokenDeletions);

    console.log(`sendCallNotification: sent=${response.successCount} failed=${response.failureCount} room=${roomId}`);
    return { sent: response.successCount };
  }
);
