import { Component, inject, effect, computed } from '@angular/core';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { FcmService } from '@bk2/shared-data-access';
import { ChatSectionStore } from './chat-section.store';
import { AppStore } from '@bk2/shared-feature';
import { IonBadge, IonButton } from '@ionic/angular/standalone';

/**
 * Example component showing how to integrate FCM notifications with Stream Chat.
 * 
 * This demonstrates:
 * 1. Requesting FCM permission and getting device token
 * 2. Saving FCM token to Firestore via Cloud Function
 * 3. Monitoring unread messages and sending notifications
 * 4. Listening for foreground notifications
 * 
 * Usage:
 * - Call requestNotificationPermission() when user opens chat or during app initialization
 * - Call checkAndNotifyUnreadMessages() periodically or when user opens/closes the app
 */
@Component({
  selector: 'bk-fcm-chat-example',
  imports: [
    IonButton, IonBadge
  ],
  template: `
    <ion-button (click)="requestNotificationPermission()">
      Enable Chat Notifications
    </ion-button>
    
    @if (unreadCount() > 0) {
      <ion-badge color="danger">{{ unreadCount() }}</ion-badge>
    }
  `,
  standalone: true
})
export class FcmChatExampleComponent {
  private readonly fcmService = inject(FcmService);
  private readonly chatStore = inject(ChatSectionStore);
  private readonly appStore = inject(AppStore);

  // IMPORTANT: Get your VAPID key from Firebase Console:
  // Project Settings > Cloud Messaging > Web Push certificates > Key pair
  private readonly VAPID_KEY = 'YOUR_VAPID_KEY_HERE';

  // Track unread message count
  protected unreadCount = computed(() => 0); // Connect this to your chat store

  constructor() {
    // Listen for foreground messages (when app is open)
    this.fcmService.listenForMessages().subscribe(payload => {
      console.log('Foreground notification received:', payload);
      
      // Show in-app notification or update UI
      this.showInAppNotification(payload);
    });

    // Check for unread messages when chat initializes
    effect(() => {
      if (this.chatStore.isChatInitialized()) {
        this.checkAndNotifyUnreadMessages();
      }
    });
  }

  /**
   * Request notification permission and save FCM token.
   * Call this when user opens the chat section or during app initialization.
   */
  async requestNotificationPermission(): Promise<void> {
    if (!this.fcmService.isSupported()) {
      console.warn('FCM not supported in this browser');
      return;
    }

    // Request permission and get token
    this.fcmService.requestPermission(this.VAPID_KEY).subscribe(async token => {
      if (token) {
        console.log('FCM token obtained:', token);
        
        // Save token to Firestore via Cloud Function
        await this.saveFcmToken(token);
      } else {
        console.log('Notification permission denied');
      }
    });
  }

  /**
   * Save FCM token to Firestore via Cloud Function.
   */
  private async saveFcmToken(token: string): Promise<void> {
    try {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (this.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }

      const saveFcmToken = httpsCallable(functions, 'saveFcmToken');
      const result = await saveFcmToken({ token });
      
      console.log('FCM token saved successfully:', result.data);
    } catch (error) {
      console.error('Error saving FCM token:', error);
    }
  }

  /**
   * Check for unread messages and send notifications if needed.
   * Call this periodically or when user opens/closes the app.
   */
  async checkAndNotifyUnreadMessages(): Promise<void> {
    try {
      // Get channels with unread messages
      const unreadChannels = await this.chatStore.getChannelsWithUnreadMessages();
      
      if (unreadChannels.length === 0) {
        console.log('No unread messages');
        return;
      }

      console.log(`Found ${unreadChannels.length} channels with unread messages`);

      // Send notification for each channel with unread messages
      for (const channel of unreadChannels) {
        const unreadCount = channel.countUnread();
        const channelId = channel.id;
        const channelName = channel.data.name || 'Chat';

        await this.sendChatNotification(channelId, channelName, unreadCount);
      }
    } catch (error) {
      console.error('Error checking unread messages:', error);
    }
  }

  /**
   * Send push notification via Cloud Function.
   */
  private async sendChatNotification(
    channelId: string, 
    channelName: string, 
    unreadCount: number
  ): Promise<void> {
    try {
      const currentUser = this.appStore.currentUser();
      if (!currentUser) return;

      const functions = getFunctions(getApp(), 'europe-west6');
      if (this.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }

      const sendChatNotification = httpsCallable(functions, 'sendChatNotification');
      
      const result = await sendChatNotification({
        userId: currentUser.bkey,
        channelId,
        channelName,
        unreadCount
      });

      console.log('Notification sent:', result.data);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Show in-app notification when message received in foreground.
   */
  private showInAppNotification(payload: any): void {
    // Implement your in-app notification UI here
    // For example, show a toast or banner at the top of the screen
    console.log('Show in-app notification:', payload);
    
    // Example: Use Ionic toast
    // this.toastController.create({
    //   message: payload.notification.body,
    //   duration: 3000,
    //   position: 'top'
    // }).then(toast => toast.present());
  }
}
