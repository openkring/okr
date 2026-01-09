import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

/**
 * Send FCM notification to a specific user about unread chat messages.
 * Called from the client after detecting unread messages.
 * 
 * @param userId - The Firebase user ID to send notification to
 * @param channelId - The Stream chat channel ID
 * @param channelName - The name of the chat channel
 * @param unreadCount - Number of unread messages
 */
export const sendChatNotification = onCall({
  region: 'europe-west6',
  enforceAppCheck: true,
  cors: true
}, async (request) => {
  logger.log('sendChatNotification: Processing request', { userId: request.data.userId });

  if (!request.auth) {
    logger.error('sendChatNotification: User not authenticated');
    throw new HttpsError('failed-precondition', 'Must be authenticated to send notifications');
  }

  const { userId, channelId, channelName, unreadCount } = request.data;

  if (!userId || !channelId) {
    throw new HttpsError('invalid-argument', 'userId and channelId are required');
  }

  try {
    // Get user's FCM token from Firestore
    // Assuming tokens are stored in a 'users' collection with document ID = userId
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      logger.warn('sendChatNotification: User document not found', { userId });
      return { success: false, message: 'User not found' };
    }

    const fcmToken = userDoc.data()?.fcmToken;
    
    if (!fcmToken) {
      logger.warn('sendChatNotification: No FCM token found for user', { userId });
      return { success: false, message: 'No FCM token registered' };
    }

    // Compose notification message
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: `${unreadCount} new message${unreadCount > 1 ? 's' : ''} in ${channelName}`,
        body: 'You have unanswered messages',
      },
      data: {
        channelId,
        channelName,
        unreadCount: String(unreadCount),
        url: `/chat?channel=${channelId}`, // Deep link to the specific chat
        type: 'chat_message'
      },
      webpush: {
        fcmOptions: {
          link: `/chat?channel=${channelId}`
        },
        notification: {
          icon: '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/badge-72x72.png',
          requireInteraction: true
        }
      }
    };

    // Send the notification
    const response = await admin.messaging().send(message);
    logger.log('sendChatNotification: Notification sent successfully', { 
      userId, 
      channelId,
      messageId: response 
    });

    return { success: true, messageId: response };
  } catch (error: any) {
    logger.error('sendChatNotification: Error sending notification', { 
      error: error.message,
      userId,
      channelId 
    });
    throw new HttpsError('internal', `Failed to send notification: ${error.message}`);
  }
});

/**
 * Scheduled function to check for unanswered chat messages and send notifications.
 * Runs every hour to check all users' unread messages.
 * 
 * This requires integration with Stream Chat webhook or using Stream's server-side SDK
 * to query unread message counts.
 */
export const checkUnreadMessagesScheduled = onSchedule({
  schedule: 'every 1 hours',
  region: 'europe-west6',
  timeZone: 'Europe/Zurich'
}, async (event) => {
  logger.log('checkUnreadMessagesScheduled: Starting scheduled check');

  try {
    // Get all users with FCM tokens
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('fcmToken', '!=', null)
      .get();

    logger.log('checkUnreadMessagesScheduled: Found users with FCM tokens', { 
      count: usersSnapshot.size 
    });

    const notifications: Promise<any>[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const fcmToken = userData.fcmToken;

      // Here you would query Stream Chat API for unread message count
      // For now, this is a placeholder showing the structure
      
      // Example: Query user's notification preferences
      const shouldNotify = userData.chatNotifications !== false;
      
      if (!shouldNotify) {
        logger.log('checkUnreadMessagesScheduled: User opted out of notifications', { userId });
        continue;
      }

      // TODO: Integrate with Stream Chat to get actual unread count
      // const unreadCount = await getStreamUnreadCount(userId);
      
      // For demonstration, you could store unread counts in Firestore
      // when your app detects them and read them here
      
      logger.log('checkUnreadMessagesScheduled: Checking user', { userId });
    }

    await Promise.all(notifications);
    
    logger.log('checkUnreadMessagesScheduled: Completed successfully', {
      notificationsSent: notifications.length
    });

    logger.log('checkUnreadMessagesScheduled: Completed', { count: notifications.length });
  } catch (error: any) {
    logger.error('checkUnreadMessagesScheduled: Error', { error: error.message });
    throw error;
  }
});

/**
 * Save or update FCM token for a user.
 * Called from the client after obtaining an FCM token.
 */
export const saveFcmToken = onCall({
  region: 'europe-west6',
  enforceAppCheck: true,
  cors: true
}, async (request) => {
  logger.log('saveFcmToken: Processing request');

  if (!request.auth) {
    throw new HttpsError('failed-precondition', 'Must be authenticated');
  }

  const { token } = request.data;
  
  if (!token) {
    throw new HttpsError('invalid-argument', 'FCM token is required');
  }

  try {
    const userId = request.auth.uid;
    
    // Save token to Firestore
    await admin.firestore().collection('users').doc(userId).set({
      fcmToken: token,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    logger.log('saveFcmToken: Token saved successfully', { userId });
    
    return { success: true };
  } catch (error: any) {
    logger.error('saveFcmToken: Error saving token', { error: error.message });
    throw new HttpsError('internal', `Failed to save token: ${error.message}`);
  }
});
