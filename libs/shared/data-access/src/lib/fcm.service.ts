import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ENV } from '@bk2/shared-config';
import { isBrowser } from '@bk2/shared-util-core';

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
  private _currentToken: string | null = null;

  /** The FCM/APNs token most recently registered on this device, or null if not yet registered. */
  get currentToken(): string | null { return this._currentToken; }

  constructor() {
    if (!isBrowser(this.platformId)) return;
    try {
      this.messaging = getMessaging(getApp());
    } catch (error) {
      console.error('FcmService: Failed to initialize Firebase Messaging', error);
    }
  }

  /**
   * Request push permission, get the FCM/APNs token, and persist it to Firestore
   * at users/{uid}/fcmTokens/{token} so Cloud Functions can send targeted notifications.
   * On native Capacitor (iOS/Android) uses PushNotifications plugin for the native token.
   * On web uses Firebase Messaging (service worker / VAPID).
   */
  async registerAndSave(uid: string): Promise<string | null> {
    if (!isBrowser(this.platformId)) return null;

    if (Capacitor.isNativePlatform()) {
      return this.registerNativeAndSave(uid);
    } else {
      return this.registerWebAndSave(uid);
    }
  }

  /** Native Capacitor (iOS / Android / macOS) — uses APNs / FCM native SDK. */
  private async registerNativeAndSave(uid: string): Promise<string | null> {
    try {
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== 'granted') {
        console.log('FcmService: Native push permission denied');
        return null;
      }

      // register() triggers the 'registration' event with the native FCM/APNs token
      await PushNotifications.register();

      return new Promise<string | null>((resolve) => {
        PushNotifications.addListener('registration', async tokenData => {
          try {
            await this.saveToken(uid, tokenData.value);
            this._currentToken = tokenData.value;
            console.log('FcmService: Native push token registered and saved');
            resolve(tokenData.value);
          } catch (e) {
            console.warn('FcmService: Failed to save native token', e);
            resolve(null);
          }
        });
        PushNotifications.addListener('registrationError', err => {
          console.warn('FcmService: Native push registration error', err);
          resolve(null);
        });
      });
    } catch (error) {
      console.warn('FcmService.registerNativeAndSave: Failed:', error);
      return null;
    }
  }

  /** Web / PWA — uses Firebase Messaging + VAPID key + service worker. */
  private async registerWebAndSave(uid: string): Promise<string | null> {
    const vapidKey = this.env.services.fcmVapidKey;
    if (!vapidKey) {
      console.warn('FcmService.registerWebAndSave: fcmVapidKey not configured in environment');
      return null;
    }
    if (!this.messaging) {
      console.warn('FcmService.registerWebAndSave: Messaging not initialized');
      return null;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('FcmService.registerWebAndSave: Notification permission denied');
        return null;
      }
      const token = await getToken(this.messaging, { vapidKey });
      if (!token) return null;
      await this.saveToken(uid, token);
      this._currentToken = token;
      console.log('FcmService.registerWebAndSave: Token registered and saved');
      return token;
    } catch (error) {
      console.warn('FcmService.registerWebAndSave: Failed to register token:', error);
      return null;
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
   * Check if push notifications are supported.
   * Native Capacitor always supported; web requires Notification + serviceWorker APIs.
   */
  isSupported(): boolean {
    if (!isBrowser(this.platformId)) return false;
    if (Capacitor.isNativePlatform()) return true;
    return 'Notification' in window && 'serviceWorker' in navigator;
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
