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

import { onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
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
            preset: 'private_chat',
            visibility: 'private',
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

    // Step 3: Force-join user via Synapse admin API (no invitation round-trip needed)
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
      // The Synapse admin join API returns 200 (idempotent) when the user is already a member.
      // A non-2xx response always indicates a real failure — throw so the client can handle it.
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
