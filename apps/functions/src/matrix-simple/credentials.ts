// apps/functions/src/matrix-simple/credentials.ts
//
// Matrix account lifecycle: Firebase→Matrix token exchange, user provisioning,
// profile sync, and deactivation.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireMatrixLocalpart,
  requireProvisionedUser,
  requireRole,
  requireParam,
  checkRateLimit,
} from './shared';

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
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<MatrixAuthResponse> => {
    try {
      // Get Firebase ID token from request context
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
      }

      // Get full user record from Firebase
      const userRecord = await getAuth().getUser(firebaseUid);

      console.log(`Getting Matrix credentials for Firebase user: ${firebaseUid}`);

      // Derive Matrix user ID from Person.okey (consistent across all chat scenarios).
      // SEC-3: requireMatrixLocalpart is the provisioning gate — throws for any caller
      // without a users/{uid}.personKey instead of minting a UID-based duplicate account.
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      checkRateLimit(firebaseUid, 'getMatrixCredentials', 10); // token minting — tightest limit
      const localpart = await requireMatrixLocalpart(firebaseUid, 'getMatrixCredentials');
      const matrixUserId = `@${localpart}:${hostname}`;

      // Check if Matrix user exists
      let matrixUserExists = false;
      try {
        const checkUserResponse = await fetch(
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
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
          `${MATRIX_HOMESERVER}/_synapse/admin/v2/users/${encodeURIComponent(matrixUserId)}`,
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
          throw new HttpsError('internal', `Failed to create Matrix user: ${errorText}`);
        }

        console.log(`Created Matrix user: ${matrixUserId}`);
      }

      // Generate Matrix access token for the user
      // Note: This requires Synapse admin API to generate tokens
      const loginResponse = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${matrixAdminToken.value()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valid_until_ms: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days (refreshed on each app init; H-6)
          }),
        }
      );

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new HttpsError('internal', `Failed to generate Matrix access token: ${errorText}`);
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
 * Provision a Matrix account for a target user by their Person.okey (personKey).
 * Called when the current user wants to start a direct chat with someone who
 * hasn't logged in yet and therefore has no Matrix account.
 * Uses the Synapse admin API, so no password or login from the target user is needed.
 */
export const provisionMatrixUser = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string }> => {
    // Provisioning a Matrix account for a person is part of the normal direct-chat
    // flow — any provisioned app user may do it (creating accounts only for real persons).
    const callerUid = await requireProvisionedUser(request, 'provisionMatrixUser');
    checkRateLimit(callerUid, 'provisionMatrixUser', 20);
    const { personKey } = request.data as { personKey: string };
    requireParam(personKey, 'personKey');

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
          throw new HttpsError('internal', `Failed to reactivate ${matrixUserId}: ${await reactivateResp.text()}`);
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
      throw new HttpsError('internal', `Failed to provision Matrix user ${matrixUserId}: ${errText}`);
    }

    console.log(`provisionMatrixUser: Created Matrix user ${matrixUserId} (${displayName})`);
    return { matrixUserId };
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
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ matrixUserId: string; deactivated: boolean }> => {
    await requireRole(request, 'deactivateMatrixUser', ['admin']);

    const { personKey, erase = false } = request.data as { personKey: string; erase?: boolean };
    requireParam(personKey, 'personKey');

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
      throw new HttpsError('internal', `Failed to deactivate ${matrixUserId}: ${await deactivateResp.text()}`);
    }

    console.log(`deactivateMatrixUser: ${matrixUserId} deactivated (erase=${erase})`);
    return { matrixUserId, deactivated: true };
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
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ success: boolean }> => {
    try {
      const firebaseUid = request.auth?.uid;
      if (!firebaseUid) {
        throw new HttpsError('unauthenticated', 'Not authenticated with Firebase');
      }

      const userRecord = await getAuth().getUser(firebaseUid);
      const hostname = new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '');
      checkRateLimit(firebaseUid, 'syncFirebaseProfileToMatrix', 10);
      const localpart = await requireMatrixLocalpart(firebaseUid, 'syncFirebaseProfileToMatrix');
      const matrixUserId = `@${localpart}:${hostname}`;

      // First, get Matrix access token for the user
      const loginResponse = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`,
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
        throw new HttpsError('internal', 'Failed to get Matrix access token for profile sync');
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
