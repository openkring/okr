import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';

// Optional: Matrix admin token for advanced operations
const matrixAdminToken = defineSecret('MATRIX_ADMIN_TOKEN');
const matrixServer = 'matrix.bkchat.etke.host';

/**
 * Optional: Helper function to ensure a user exists in Matrix
 * Called after successful OIDC authentication
 */
export const ensureMatrixUser = onCall({
    region: 'europe-west6',
    enforceAppCheck: true,
    cors: true 
  },  async (request) => {
    logger.info('ensureMatrixUser: Processing request', { 
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;

  try {
    const user = await getAuth().getUser(uid);
    const matrixUserId = `@${uid}:${matrixServer}`;

    logger.info('Matrix user provisioned via OIDC', { 
      firebaseUid: uid, 
      matrixUserId,
      displayName: user.displayName,
    });

    return {
      userId: matrixUserId,
      displayName: user.displayName || user.email?.split('@')[0],
      avatarUrl: user.photoURL,
    };
  } catch (error) {
    logger.error('Failed to provision Matrix user', { error, uid });
    throw new HttpsError('internal', 'Failed to provision user');
  }
});

/**
 * Create or ensure a group room exists in Matrix
 * This uses the Matrix admin API to create rooms
 */
export const ensureGroupRoom = onCall(
  { 
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
    cors: true,
  },
  async (request) => {
    logger.info('ensureGroupRoom: Processing request', { 
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { groupId, groupName, memberUids } = request.data as {
      groupId: string;
      groupName: string;
      memberUids: string[];
    };

    if (!groupId || !groupName || !memberUids) {
      throw new HttpsError('invalid-argument', 'groupId, groupName, and memberUids are required');
    }

    try {
      const adminToken = matrixAdminToken.value();
      const homeserverUrl = `https://${matrixServer}`;
      
      // Convert Firebase UIDs to Matrix user IDs
      const matrixUserIds = memberUids.map(uid => `@${uid}:${matrixServer}`);
      
      // Try to get existing room by alias
      const roomAlias = `#group_${groupId}:${matrixServer}`;
      
      try {
        const resolveResponse = await fetch(
          `${homeserverUrl}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
          {
            headers: { 'Authorization': `Bearer ${adminToken}` },
          }
        );

        if (resolveResponse.ok) {
          const existingRoom = await resolveResponse.json();
          logger.info('Group room already exists', { roomAlias, roomId: existingRoom.room_id });
          
          // Invite new members if any
          await inviteMembersToRoom(homeserverUrl, adminToken, existingRoom.room_id, matrixUserIds);
          
          return {
            roomId: existingRoom.room_id,
            roomAlias,
            created: false,
          };
        }
      } catch (error) {
        // Room doesn't exist, continue to create it
        logger.info('Room does not exist, creating new one', { roomAlias });
      }

      // Create new room
      const createResponse = await fetch(
        `${homeserverUrl}/_matrix/client/v3/createRoom`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: groupName,
            room_alias_name: `group_${groupId}`,
            topic: `Group chat for ${groupName}`,
            preset: 'private_chat',
            visibility: 'private',
            invite: matrixUserIds,
            initial_state: [
              {
                type: 'm.room.join_rules',
                state_key: '',
                content: { join_rule: 'invite' },
              },
              {
                type: 'm.room.history_visibility',
                state_key: '',
                content: { history_visibility: 'invited' },
              },
            ],
            power_level_content_override: {
              users: {
                [`@${request.auth.uid}:${matrixServer}`]: 100, // Make creator admin
              },
            },
          }),
        }
      );

      if (!createResponse.ok) {
        const error = await createResponse.text();
        logger.error('Failed to create Matrix room', { error, groupId });
        throw new HttpsError('internal', `Failed to create room: ${error}`);
      }

      const room = await createResponse.json();
      
      logger.info('Group room created successfully', { 
        roomId: room.room_id, 
        roomAlias,
        members: matrixUserIds.length,
      });

      return {
        roomId: room.room_id,
        roomAlias,
        created: true,
      };
    } catch (error: any) {
      logger.error('Failed to ensure group room', { error: error.message, groupId });
      throw new HttpsError('internal', error.message || 'Failed to create/update group room');
    }
  }
);

/**
 * Invite members to an existing room
 */
async function inviteMembersToRoom(
  homeserverUrl: string,
  adminToken: string,
  roomId: string,
  userIds: string[]
): Promise<void> {
  for (const userId of userIds) {
    try {
      const inviteResponse = await fetch(
        `${homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: userId }),
        }
      );

      if (!inviteResponse.ok && inviteResponse.status !== 403) {
        // 403 means user is already in room, which is fine
        logger.warn('Failed to invite user to room', { 
          userId, 
          roomId, 
          status: inviteResponse.status 
        });
      }
    } catch (error) {
      logger.warn('Error inviting user to room', { userId, roomId, error });
    }
  }
}

/**
 * Sync Firebase user profile changes to Matrix
 */
export const syncUserProfileToMatrix = onCall(
  { 
    secrets: [matrixAdminToken],
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true
  },
  async (request) => {
    logger.info('syncUserProfileToMatrix: Processing request', { 
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;

    try {
      const user = await getAuth().getUser(uid);
      const matrixUserId = `@${uid}:${matrixServer}`;
      const adminToken = matrixAdminToken.value();
      const homeserverUrl = `https://${matrixServer}`;

      // Update display name
      if (user.displayName) {
        await fetch(
          `${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(matrixUserId)}/displayname`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ displayname: user.displayName }),
          }
        );
      }

      // Update avatar URL
      if (user.photoURL) {
        // First, upload the avatar to Matrix
        const avatarResponse = await fetch(user.photoURL);
        const avatarBlob = await avatarResponse.blob();
        
        const uploadResponse = await fetch(
          `${homeserverUrl}/_matrix/media/v3/upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': avatarBlob.type,
            },
            body: avatarBlob,
          }
        );

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          
          await fetch(
            `${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(matrixUserId)}/avatar_url`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ avatar_url: uploadData.content_uri }),
            }
          );
        }
      }

      logger.info('Synced user profile to Matrix', { uid, matrixUserId });
      
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to sync user profile', { error: error.message, uid });
      throw new HttpsError('internal', 'Failed to sync profile');
    }
  }
);
