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
import { defineSecret } from 'firebase-functions/params';

const matrixAdminToken = defineSecret('MATRIX_ADMIN_TOKEN');
const MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER || 'https://matrix.bkchat.etke.host';

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

      // Get full user  record from Firebase
      const userRecord = await getAuth().getUser(firebaseUid);
      
      console.log(`Getting Matrix credentials for Firebase user: ${firebaseUid}`);

      // Generate Matrix user ID
      const matrixUserId = `@${firebaseUid}:${new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '')}`;

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
      const matrixUserId = `@${firebaseUid}:${new URL(MATRIX_HOMESERVER).hostname.replace('matrix.', '')}`;

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
