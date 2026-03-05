import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ENV } from '@bk2/shared-config';

/**
 * Service for Firebase Cloud Messaging (FCM) push notifications.
 * Handles device token registration, persistence to Firestore, and foreground message reception.
 */
@Injectable({
  providedIn: 'root'
})
export class FcmService {
  private messaging: Messaging | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly env = inject(ENV);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.messaging = getMessaging(getApp());
    } catch (error) {
      console.error('FcmService: Failed to initialize Firebase Messaging', error);
    }
  }

  /**
   * Request push permission, get the FCM token, and persist it to Firestore
   * at users/{uid}/fcmTokens/{token} so Cloud Functions can send targeted notifications.
   */
  async registerAndSave(uid: string): Promise<void> {
    const vapidKey = this.env.services.fcmVapidKey;
    if (!vapidKey) {
      console.warn('FcmService.registerAndSave: fcmVapidKey not configured in environment');
      return;
    }
    if (!this.messaging) {
      console.warn('FcmService.registerAndSave: Messaging not initialized');
      return;
    }
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('FcmService.registerAndSave: Notification permission denied');
        return;
      }
      const token = await getToken(this.messaging, { vapidKey });
      if (!token) return;
      await this.saveToken(uid, token);
      console.log('FcmService.registerAndSave: Token registered and saved');
    } catch (error) {
      console.warn('FcmService.registerAndSave: Failed to register token:', error);
    }
  }

  /**
   * Remove a stale FCM token from Firestore.
   */
  async removeToken(uid: string, token: string): Promise<void> {
    try {
      const db = getFirestore(getApp());
      await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token));
    } catch (error) {
      console.warn('FcmService.removeToken: Failed to remove token:', error);
    }
  }

  /**
   * Request permission and get FCM device token.
   * @param vapidKey - Web Push certificate key from Firebase Console → Project Settings → Cloud Messaging
   */
  requestPermission(vapidKey: string): Observable<string | undefined> {
    if (!this.messaging) {
      console.error('FcmService.requestPermission: Messaging not initialized');
      return of(undefined);
    }

    return from(
      Notification.requestPermission().then(async (permission) => {
        if (permission === 'granted') {
          const token = await getToken(this.messaging!, { vapidKey });
          console.log('FcmService: FCM token obtained');
          return token;
        }
        console.log('FcmService: Notification permission denied');
        return undefined;
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
   */
  listenForMessages(): Observable<any> {
    if (!this.messaging) {
      return of(null);
    }

    return new Observable(subscriber => {
      const unsubscribe = onMessage(this.messaging!, (payload) => {
        subscriber.next(payload);
      });
      return () => unsubscribe();
    });
  }

  /**
   * Check if FCM is supported in the current browser.
   */
  isSupported(): boolean {
    return isPlatformBrowser(this.platformId) &&
      'Notification' in window &&
      'serviceWorker' in navigator;
  }

  private async saveToken(uid: string, token: string): Promise<void> {
    const db = getFirestore(getApp());
    // Use first 128 chars of token as doc ID (tokens are URL-safe, well under Firestore's 1500-byte limit)
    const tokenDocId = token.substring(0, 128);
    await setDoc(
      doc(db, 'users', uid, 'fcmTokens', tokenDocId),
      { token, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}
