import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported, Messaging } from 'firebase/messaging';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, collection, query, where, documentId, getDocs, writeBatch } from 'firebase/firestore';
import { EMPTY, Observable, from, fromEvent, of } from 'rxjs';
import { catchError, filter, map } from 'rxjs/operators';

import { ENV } from '@okr/shared-config';
import { isBrowser } from '@okr/shared-util-core';

/** Where the Firebase Messaging SDK registers firebase-messaging-sw.js (its DEFAULT_SW_SCOPE). */
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

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
    // Firebase's own isSupported() is the precise check for the APIs getMessaging() needs.
    // It returns false e.g. on iOS Safari in a regular browser tab (web push there only works
    // for home-screen PWAs), so we skip getMessaging() rather than let it throw
    // messaging/unsupported-browser and pollute error reporting.
    isMessagingSupported().then((supported) => {
      if (!supported) return;
      try {
        this.messaging = getMessaging(getApp());
      } catch (error) {
        console.error('FcmService: Failed to initialize Firebase Messaging', error);
      }
    });
  }

  /**
   * Request push permission, get the FCM/APNs token, and persist it to Firestore
   * at users/{uid}/fcmTokens/{token} so Cloud Functions can send targeted notifications.
   * On native Capacitor (iOS/Android) uses PushNotifications plugin for the native token.
   * On web uses Firebase Messaging (service worker / VAPID).
   *
   * @param allowPrompt When `false` (default) the method never shows a permission prompt and
   *   only registers a token if permission was already granted. This is required for automatic
   *   background initialisation: Safari/WebKit throws "Notification prompting can only be done
   *   from a user gesture" if `Notification.requestPermission()` is called outside a user
   *   activation. Pass `true` ONLY from a user-gesture handler (e.g. a button click).
   */
  async registerAndSave(uid: string, allowPrompt = false): Promise<string | null> {
    if (!isBrowser(this.platformId)) return null;

    if (Capacitor.isNativePlatform()) {
      return this.registerNativeAndSave(uid, allowPrompt);
    } else {
      return this.registerWebAndSave(uid, allowPrompt);
    }
  }

  /** Native Capacitor (iOS / Android / macOS) — uses APNs / FCM native SDK. */
  private async registerNativeAndSave(uid: string, allowPrompt: boolean): Promise<string | null> {
    try {
      let { receive } = await PushNotifications.checkPermissions();
      if (receive === 'prompt' || receive === 'prompt-with-rationale') {
        if (!allowPrompt) {
          console.log('FcmService: Native push permission not yet granted; skipping (no user gesture)');
          return null;
        }
        receive = (await PushNotifications.requestPermissions()).receive;
      }
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
  private async registerWebAndSave(uid: string, allowPrompt: boolean): Promise<string | null> {
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
      // Safari/WebKit throws "Notification prompting can only be done from a user gesture" if
      // requestPermission() is called outside a user activation. Only prompt when allowPrompt
      // is set (i.e. invoked from a click handler); otherwise proceed only if already granted.
      let permission = Notification.permission;
      if (permission === 'default') {
        if (!allowPrompt) {
          console.log('FcmService.registerWebAndSave: permission not yet granted; skipping (no user gesture)');
          return null;
        }
        permission = await Notification.requestPermission();
      }
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
   * The service-worker registration that shows push banners: the FCM worker, registered by the
   * SDK at FCM_SW_SCOPE. `navigator.serviceWorker.ready` / `getRegistration()` return ngsw's
   * root-scope registration instead, whose notificationclick ignores `data.url` and whose
   * getNotifications() never lists a banner the FCM worker showed. Falls back to `ready`
   * before the first getToken() has registered the FCM worker.
   */
  async getPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
    if (!isBrowser(this.platformId) || !('serviceWorker' in navigator)) return undefined;
    const reg = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE).catch(() => undefined);
    return reg ?? navigator.serviceWorker.ready;
  }

  /**
   * In-app path of a tapped notification, when the FCM worker could not navigate the open
   * window itself (it does not control it — ngsw does) and posted it here instead.
   */
  notificationClicks(): Observable<string> {
    if (!isBrowser(this.platformId) || !('serviceWorker' in navigator)) return EMPTY;
    return fromEvent<MessageEvent>(navigator.serviceWorker, 'message').pipe(
      map((event) => {
        const data = event.data as { type?: string; url?: string } | undefined;
        if (data?.type !== 'notification-click' || typeof data.url !== 'string') return null;
        const url = new URL(data.url, location.origin);
        return url.origin === location.origin ? url.pathname + url.search + url.hash : null;
      }),
      filter((path): path is string => path !== null),
    );
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
    await this.removeSupersededTokens(db, uid, token, tokenDocId);
  }

  /**
   * Drop the earlier tokens of THIS installation.
   *
   * A web token is `<app-instance-id>:<credential>`; FCM rotates the credential (service-worker
   * reinstall, storage eviction) but keeps the instance id, and the old token is not reported
   * as unregistered for a long time. Nothing else ever deleted them, so one device piled up a
   * tail of dead tokens (11 for one installation, 2026-09-15) and every push fanned out to all
   * of them. Doc ids start with the token, so a range query on the id prefix finds the siblings
   * without reading anything else. Best effort — a failure here must not fail the registration.
   */
  private async removeSupersededTokens(db: ReturnType<typeof getFirestore>, uid: string, token: string, keepDocId: string): Promise<void> {
    const colon = token.indexOf(':');
    if (colon <= 0) return;                      // native APNs tokens carry no instance id
    const prefix = token.substring(0, colon + 1);
    try {
      const siblings = await getDocs(query(
        collection(db, 'users', uid, 'fcmTokens'),
        where(documentId(), '>=', prefix),
        where(documentId(), '<', prefix + '\uf8ff'),
      ));
      const stale = siblings.docs.filter((d) => d.id !== keepDocId);
      if (stale.length === 0) return;
      const batch = writeBatch(db);
      for (const d of stale) batch.delete(d.ref);
      await batch.commit();
      console.log(`FcmService: removed ${stale.length} superseded token(s) of this installation`);
    } catch (error) {
      console.warn('FcmService.removeSupersededTokens: failed (ignored):', error);
    }
  }
}
