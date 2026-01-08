import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Service for Firebase Cloud Messaging (FCM) push notifications.
 * Handles device token registration and foreground message reception.
 */
@Injectable({
  providedIn: 'root'
})
export class FcmService {
  private messaging: Messaging | null = null;

  constructor() {
    try {
      // Initialize Firebase Messaging
      this.messaging = getMessaging(getApp());
    } catch (error) {
      console.error('FcmService: Failed to initialize Firebase Messaging', error);
    }
  }

  /**
   * Request permission and get FCM device token.
   * This token should be saved to Firestore for sending targeted notifications.
   * @param vapidKey - Your Firebase Cloud Messaging Web Push certificate key (from Firebase Console > Project Settings > Cloud Messaging)
   * @returns Observable<string | undefined> - The FCM token or undefined if permission denied
   */
  requestPermission(vapidKey: string): Observable<string | undefined> {
    if (!this.messaging) {
      console.error('FcmService.requestPermission: Messaging not initialized');
      return of(undefined);
    }

    return from(
      Notification.requestPermission().then(async (permission) => {
        if (permission === 'granted') {
          console.log('FcmService: Notification permission granted');
          
          // Get FCM token
          const token = await getToken(this.messaging!, { vapidKey });
          console.log('FcmService: FCM token obtained:', token);
          return token;
        } else {
          console.log('FcmService: Notification permission denied');
          return undefined;
        }
      })
    ).pipe(
      catchError((error) => {
        console.error('FcmService.requestPermission: Error getting token', error);
        return of(undefined);
      })
    );
  }

  /**
   * Listen for foreground messages (when app is open).
   * Background messages are handled by the service worker (firebase-messaging-sw.js).
   * @returns Observable that emits received messages
   */
  listenForMessages(): Observable<any> {
    if (!this.messaging) {
      console.error('FcmService.listenForMessages: Messaging not initialized');
      return of(null);
    }

    return new Observable(subscriber => {
      const unsubscribe = onMessage(this.messaging!, (payload) => {
        console.log('FcmService: Foreground message received:', payload);
        subscriber.next(payload);
      });

      return () => unsubscribe();
    });
  }

  /**
   * Check if FCM is supported in the current browser.
   */
  isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }
}
