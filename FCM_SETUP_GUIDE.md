# Firebase Cloud Messaging (FCM) Setup Guide for Chat Notifications

This guide explains how to use Firebase Cloud Messaging to notify users about unanswered chat messages in your getstream.io integration.

## Overview

The FCM implementation consists of:

1. **Client-side service** (`FcmService`) - Requests permission and handles tokens
2. **Service worker** (`firebase-messaging-sw.js`) - Handles background notifications
3. **Cloud Functions** - Send notifications and save tokens
4. **Integration example** - Shows how to tie it all together with Stream Chat

## 📋 Prerequisites

- Firebase project with Cloud Messaging enabled
- VAPID key (Web Push certificate) from Firebase Console
- Cloud Functions deployed

## 🔧 Setup Steps

### 1. Get Your VAPID Key

1. Go to Firebase Console > Project Settings > Cloud Messaging
2. Under "Web Push certificates", generate or copy your key pair
3. Save this key - you'll need it in your code

### 2. Configure Service Worker

Update [`apps/test-app/src/firebase-messaging-sw.js`](apps/test-app/src/firebase-messaging-sw.js):

```javascript
// Replace with your Firebase config
firebase.initializeApp({
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID'
});
```

### 3. Register Service Worker

Add to your app's initialization (e.g., `app.component.ts` or `main.ts`):

```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
}
```

### 4. Update angular.json Assets

Ensure the service worker is copied during build:

```json
{
  "architect": {
    "build": {
      "options": {
        "assets": [
          "apps/test-app/src/favicon.ico",
          "apps/test-app/src/assets",
          "apps/test-app/src/firebase-messaging-sw.js"
        ]
      }
    }
  }
}
```

### 5. Deploy Cloud Functions

```bash
pnpm run build:functions
firebase deploy --only functions:sendChatNotification,functions:saveFcmToken,functions:checkUnreadMessagesScheduled
```

## 💻 Usage in Your App

### Basic Setup

```typescript
import { Component, inject, effect } from '@angular/core';
import { FcmService } from '@bk2/shared-data-access';
import { ChatSectionStore } from '@bk2/cms-section-feature';

@Component({...})
export class YourChatComponent {
  private fcmService = inject(FcmService);
  private chatStore = inject(ChatSectionStore);
  
  private VAPID_KEY = 'YOUR_VAPID_KEY'; // From Firebase Console

  ngOnInit() {
    // Request permission when user opens chat
    this.requestNotificationPermission();
    
    // Listen for foreground messages
    this.fcmService.listenForMessages().subscribe(message => {
      console.log('Message received:', message);
      // Show in-app notification
    });
  }

  async requestNotificationPermission() {
    this.fcmService.requestPermission(this.VAPID_KEY).subscribe(async token => {
      if (token) {
        await this.saveFcmToken(token);
      }
    });
  }

  async saveFcmToken(token: string) {
    const functions = getFunctions(getApp(), 'europe-west6');
    const saveFcmToken = httpsCallable(functions, 'saveFcmToken');
    await saveFcmToken({ token });
  }
}
```

### Send Notifications for Unread Messages

```typescript
async notifyAboutUnreadMessages() {
  // Get unread channels
  const unreadChannels = await this.chatStore.getChannelsWithUnreadMessages();
  
  for (const channel of unreadChannels) {
    const functions = getFunctions(getApp(), 'europe-west6');
    const sendNotification = httpsCallable(functions, 'sendChatNotification');
    
    await sendNotification({
      userId: this.currentUser.bkey,
      channelId: channel.id,
      channelName: channel.data.name,
      unreadCount: channel.countUnread()
    });
  }
}
```

### Automated Notifications (Scheduled)

The Cloud Function `checkUnreadMessagesScheduled` runs every hour automatically. To customize:

```typescript
// In apps/functions/src/fcm/index.ts
export const checkUnreadMessagesScheduled = onSchedule({
  schedule: 'every 30 minutes', // Change frequency
  region: 'europe-west6',
  timeZone: 'Europe/Zurich'
}, async (event) => {
  // Check all users and send notifications
});
```

## 🔐 Firestore Data Structure

FCM tokens are stored in Firestore:

```typescript
// Collection: users
// Document ID: <userId>
{
  fcmToken: "eXaMpLeToKeN...",
  fcmTokenUpdatedAt: Timestamp,
  chatNotifications: true, // User preference
  // ... other user data
}
```

## 🎯 Integration with Stream Chat

The implementation provides three methods in `ChatSectionStore`:

### 1. Get Channels with Unread Messages
```typescript
const unreadChannels = await this.chatStore.getChannelsWithUnreadMessages();
// Returns: Array of Channel objects with unread counts > 0
```

### 2. Get Total Unread Count
```typescript
const total = await this.chatStore.getTotalUnreadCount();
// Returns: number (e.g., 5)
```

### 3. Get Channels Awaiting Response
```typescript
const needsReply = await this.chatStore.getChannelsAwaitingResponse();
// Returns: Channels where last message is NOT from current user
```

## 📱 Testing

### Local Testing (Emulator)

1. Start Firebase emulators:
```bash
firebase emulators:start
```

2. Test notification sending:
```bash
curl -X POST http://localhost:5001/YOUR_PROJECT/europe-west6/sendChatNotification \
  -H "Content-Type: application/json" \
  -d '{"data": {"userId": "test-user", "channelId": "test-channel", "channelName": "Test", "unreadCount": 5}}'
```

### Production Testing

1. Enable FCM in Firebase Console
2. Deploy functions: `firebase deploy --only functions`
3. Test from your app using the example component

## 🚨 Troubleshooting

### Notifications not received?

1. **Check permissions**: Browser must grant notification permission
2. **Verify VAPID key**: Must match Firebase Console key
3. **Service Worker**: Must be registered successfully
4. **FCM token**: Must be saved to Firestore
5. **Cloud Functions**: Must be deployed and have correct permissions

### Check FCM token:

```typescript
console.log('FCM supported?', this.fcmService.isSupported());

this.fcmService.requestPermission(VAPID_KEY).subscribe(token => {
  console.log('Token:', token); // Should not be undefined
});
```

### Check Firestore:

```javascript
// Firestore Console
firebase firestore get users/<YOUR_USER_ID>
// Should show: fcmToken: "..."
```

### Check Cloud Function logs:

```bash
firebase functions:log --only sendChatNotification
```

## 🎨 Customization

### Custom Notification Appearance

Edit [`firebase-messaging-sw.js`](apps/test-app/src/firebase-messaging-sw.js):

```javascript
const notificationOptions = {
  body: 'Your custom message',
  icon: '/path/to/your/icon.png',
  badge: '/path/to/your/badge.png',
  data: { customData: 'value' },
  actions: [
    { action: 'reply', title: 'Reply' },
    { action: 'dismiss', title: 'Dismiss' }
  ]
};
```

### Notification Frequency

Prevent notification spam by tracking last notification time:

```typescript
private lastNotificationTime = new Map<string, number>();

async sendNotificationIfNeeded(channelId: string) {
  const now = Date.now();
  const lastTime = this.lastNotificationTime.get(channelId) || 0;
  const COOLDOWN = 5 * 60 * 1000; // 5 minutes
  
  if (now - lastTime < COOLDOWN) {
    return; // Skip notification, too soon
  }
  
  await this.sendChatNotification(channelId, ...);
  this.lastNotificationTime.set(channelId, now);
}
```

## 📚 Additional Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Notifications Guide](https://web.dev/push-notifications-overview/)
- [Stream Chat Angular SDK](https://getstream.io/chat/docs/sdk/angular/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## 🔗 Related Files

- [`libs/shared/data-access/src/lib/fcm.service.ts`](libs/shared/data-access/src/lib/fcm.service.ts) - Client service
- [`apps/test-app/src/firebase-messaging-sw.js`](apps/test-app/src/firebase-messaging-sw.js) - Service worker
- [`apps/functions/src/fcm/index.ts`](apps/functions/src/fcm/index.ts) - Cloud Functions
- [`libs/cms/section/feature/src/lib/chat-section.store.ts`](libs/cms/section/feature/src/lib/chat-section.store.ts) - Chat integration
- [`libs/cms/section/feature/src/lib/fcm-chat-example.component.ts`](libs/cms/section/feature/src/lib/fcm-chat-example.component.ts) - Usage example
