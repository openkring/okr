// Firebase Messaging Service Worker
// This file handles background push notifications when the app is not in focus

importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

// Import Firebase configuration (generated at build time from environment)
importScripts('./firebase-config.js');

// Initialize Firebase in the service worker using the generated config
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(payload => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  // Set the app icon badge (PWA Badging API — supported on iOS 16.4+ and Android Chrome).
  // badgeCount is sent by the Cloud Function as the total number of pending items
  // (unread chat messages + open tasks, etc.). Falls back to 1 if not provided.
  if (self.navigator?.setAppBadge) {
    const raw = payload.data?.badgeCount;
    const count = raw !== undefined ? Math.max(1, parseInt(raw, 10) || 1) : 1;
    self.navigator.setAppBadge(count).catch(() => {});
  }

  // Title and body come from data (data-only message) or fall back to notification field
  const notificationTitle = payload.data?.title || payload.notification?.title || 'New Message';

  // iOS PWA silently drops showNotification() when requireInteraction or actions are present
  // (these options are not supported on iOS and cause a silent failure, not a no-op).
  const isVideoCall = payload.data?.type === 'video-call';
  const isIOS = /iP(ad|hone|od)/.test(self.navigator?.userAgent || '');
  const supportsActions = !isIOS && typeof Notification !== 'undefined' && (Notification.maxActions ?? 0) > 0;

  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || 'You have unread messages',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    data: payload.data,
    tag: isVideoCall ? 'video-call' : (payload.data?.channelId || 'default'),
    ...(supportsActions && {
      requireInteraction: isVideoCall,
      actions: isVideoCall
        ? [{ action: 'open', title: 'Anruf öffnen' }, { action: 'dismiss', title: 'Ablehnen' }]
        : [{ action: 'open', title: 'Open Chat' }, { action: 'dismiss', title: 'Dismiss' }],
    }),
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  event.notification.close();

  // Clear the app icon badge
  if (self.navigator?.clearAppBadge) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  if (event.action === 'open' || !event.action) {
    // Open the app and navigate to the chat
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // If app is already open, focus it
          for (const client of clientList) {
            if (client.url.includes(self.registration.scope) && 'focus' in client) {
              return client.focus().then(() => {
                if ('navigate' in client) {
                  return client.navigate(urlToOpen);
                }
              });
            }
          }
          // Otherwise, open a new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});
