import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Badge } from '@capawesome/capacitor-badge';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported, Messaging } from 'firebase/messaging';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, collection, query, where, documentId, getDocs, writeBatch } from 'firebase/firestore';
import { EMPTY, Observable, fromEvent } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ENV } from '@okr/shared-config';
import { fcmTokenDocId, isBrowser, type PushPermissionState, type PushTokenPlatform } from '@okr/shared-util-core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ensureNativePushChannel } from './native-push-channel';

/** Where the Firebase Messaging SDK registers firebase-messaging-sw.js (its DEFAULT_SW_SCOPE). */
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/** Logout on native (1.127 M1): clear the icon badge and every delivered notification. */
async function clearNativeBadgeAndTray(): Promise<void> {
  const results = await Promise.allSettled([Badge.clear(), PushNotifications.removeAllDeliveredNotifications()]);
  for (const r of results) {
    if (r.status === 'rejected') console.warn('FcmService.disablePush: clearing badge/tray failed (ignored):', r.reason);
  }
}

/**
 * How long a native registration waits for the `registration` event (N4). iOS does not always
 * answer (simulator, no APNs): the caller then gets null and a later call simply tries again.
 */
export const NATIVE_REGISTRATION_TIMEOUT_MS = 15_000;

/** The native registration currently waiting for its `registration` event. */
interface PendingNativeRegistration {
  uid: string;
  generation: number;
  promise: Promise<string | null>;
  resolve(token: string | null): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Service for Firebase Cloud Messaging (FCM) push notifications.
 * Handles device token registration, persistence to Firestore, and foreground message reception.
 */
@Injectable({
  providedIn: 'root'
})
export class FcmService {
  private messaging: Messaging | null = null;
  /**
   * Settles once the Messaging init below has finished (with null when unsupported). Push
   * listeners and registration start at bootstrap now (1.127), often before that init is done.
   */
  private messagingReady: Promise<Messaging | null> = Promise.resolve(null);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly env = inject(ENV);
  private _currentToken: string | null = null;
  /** The token the Matrix pusher was last registered for (undefined = not yet on this token). */
  private pusherToken: string | undefined;
  /** Registration currently in flight, so overlapping calls for the same token share one call. */
  private pusherInFlight?: { token: string; promise: Promise<void> };
  /**
   * Push session generation, bumped synchronously by disablePush (logout). A registration that
   * started in an earlier generation and finishes after the logout drops its result: it sets no
   * token, deletes a token doc it already wrote and registers no Matrix pusher — otherwise a
   * shared device keeps receiving the signed-out member's pushes.
   */
  private generation = 0;
  /**
   * Logout latch, set by disablePush and cleared only by {@link beginSession} for the next
   * signed-in uid. The generation alone is not enough: a registration that STARTS inside the
   * logout window (after disablePush, before signOut — e.g. the resume refresh) captures the new
   * generation and would write a token doc and a pusher for the signed-out member.
   */
  private loggedOut = false;
  /**
   * Token saves still running (saveTokenUnlessLoggedOut). disablePush waits for them so a save
   * that sees the logout deletes its doc while the user is still signed in — after signOut the
   * rules deny that delete and the doc would survive on a shared device.
   */
  private readonly savesInFlight = new Set<Promise<boolean>>();
  /**
   * The permanent native `registration` / `registrationError` listener pair, installed once before
   * the first register() (N4). iOS does not retain the event, so a listener added after register()
   * can miss it; one pair per call piled up listeners that were never removed.
   */
  private nativeListeners?: Promise<void>;
  /** The native registration waiting for its event; an event without one is a token refresh (N6). */
  private pendingNative?: PendingNativeRegistration;
  /**
   * uid and generation of the last native registration. A refresh is saved for them, and is
   * dropped once that session ended (logout or a new session: saveTokenUnlessLoggedOut).
   */
  private nativeSession?: { uid: string; generation: number };

  /** The FCM/APNs token most recently registered on this device, or null if not yet registered. */
  get currentToken(): string | null { return this._currentToken; }

  constructor() {
    if (!isBrowser(this.platformId)) return;
    // Firebase's own isSupported() is the precise check for the APIs getMessaging() needs.
    // It returns false e.g. on iOS Safari in a regular browser tab (web push there only works
    // for home-screen PWAs), so we skip getMessaging() rather than let it throw
    // messaging/unsupported-browser and pollute error reporting.
    this.messagingReady = isMessagingSupported().then((supported) => {
      if (!supported) return null;
      try {
        this.messaging = getMessaging(getApp());
      } catch (error) {
        console.error('FcmService: Failed to initialize Firebase Messaging', error);
      }
      return this.messaging;
    }).catch(() => null);
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
  /**
   * Notification permission on this device, without asking. Native: the Capacitor plugin's
   * state; web: `Notification.permission` (`default` → `prompt`).
   */
  async getPermissionState(): Promise<PushPermissionState> {
    if (!isBrowser(this.platformId)) return 'unsupported';
    if (Capacitor.isNativePlatform()) {
      const { receive } = await PushNotifications.checkPermissions();
      return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
    }
    if (typeof Notification === 'undefined' || !this.isSupported()) return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }

  /**
   * Register this device for push: the FCM token in Firestore and, when `withPusher`, the Matrix
   * HTTP pusher so chat messages reach it as well as tasks and calendar pushes. The pusher is its
   * own step ({@link ensureMatrixPusher}) so it can follow later, once Matrix is actually in use.
   *
   * @param allowPrompt see {@link registerAndSave}; `true` only from a user gesture
   * @param withPusher register the Matrix pusher too (default true)
   * @return the token, or null when push is not (yet) allowed or registration failed
   */
  async enablePush(uid: string, allowPrompt = false, withPusher = true): Promise<string | null> {
    if (this.loggedOut) return null;
    const token = await this.registerAndSave(uid, allowPrompt);
    if (!token) return null;
    if (withPusher) await this.ensureMatrixPusher();
    return token;
  }

  /**
   * Register the Matrix pusher for the current token, once per token. No-op without a token.
   * Never throws: a failure is only logged and retried by the next call.
   */
  async ensureMatrixPusher(): Promise<void> {
    const token = this._currentToken;
    if (!token || this.loggedOut || this.pusherToken === token) return;
    if (this.pusherInFlight?.token === token) return this.pusherInFlight.promise;
    const promise = this.registerPusher(token, this.generation).finally(() => {
      if (this.pusherInFlight?.promise === promise) this.pusherInFlight = undefined;
    });
    this.pusherInFlight = { token, promise };
    return promise;
  }

  /**
   * Remove this device from push on logout: the token doc, the Matrix pusher and (native) the OS
   * registration. Never throws; does nothing when no token was registered on this device.
   * Not time-bounded offline: callers wrap it in a timeout.
   */
  async disablePush(uid: string): Promise<void> {
    // First, and even without a token: a registration still inside getToken / saveToken has not
    // set _currentToken yet, and must see the logout when it resumes. The latch stops the ones
    // that start from now on, until the next sign-in (beginSession).
    this.generation++;
    const gen = this.generation;
    this.loggedOut = true;
    // Read synchronously right after the bump: from now on no registration can adopt a token
    // (the adopting check and assignment are one synchronous step), so this is complete.
    const token = this._currentToken;
    // A pusher registration still running when the user logs out would land AFTER the
    // unregister call and leave a pusher behind (chat pushes to a signed-out device). Keep its
    // promise to wait for it below; the logout timeout in AuthService bounds the wait.
    const inFlight = this.pusherInFlight?.promise;
    // Reset BEFORE the first await: a registerPusher still in flight must not re-mark the token
    // as registered, and a slow disablePush must not wipe the state of a login that follows.
    this._currentToken = null;
    this.pusherToken = undefined;
    this.pusherInFlight = undefined;
    // Let running token saves finish while still signed in: each one now sees the bumped
    // generation and deletes the doc it wrote (or writes none). Bounded by the logout timeout.
    // Only the save phase is tracked, not the whole registration: a native registration that
    // never gets its event (N4) must not hold up the logout of an existing token.
    await Promise.all([...this.savesInFlight].map(p => p.catch(() => false)));
    if (token) {
      try {
        const unregister = httpsCallable<{ pushkey: string }, { removed: boolean }>(
          getFunctions(getApp(), 'europe-west6'), 'unregisterMatrixPusher');
        // A step may run late (after the awaited in-flight registration, or after the logout timeout
        // let signOut happen). Another member may be signed in by then, and the web token is the same
        // for every user of one browser: such a step would delete THEIR pusher / registration.
        let skippedLogged = false;
        const stillThisLogout = (): boolean => {
          const ok = this.loggedOut && this.generation === gen && getAuth(getApp()).currentUser?.uid === uid;
          if (!ok && !skippedLogged) {
            skippedLogged = true;
            console.log('FcmService.disablePush: logout step skipped, another session began');
          }
          return ok;
        };
        const unregisterPusher = async () => {
          await inFlight?.catch(() => undefined);
          if (!stillThisLogout()) return;
          return unregister({ pushkey: token });
        };
        const results = await Promise.allSettled([
          stillThisLogout() ? this.removeToken(uid, token) : Promise.resolve(),
          unregisterPusher(),
          Capacitor.isNativePlatform() && stillThisLogout() ? PushNotifications.unregister() : Promise.resolve(),
        ]);
        for (const r of results) {
          if (r.status === 'rejected') console.warn('FcmService.disablePush: step failed (ignored):', r.reason);
        }
      } catch (err) {
        console.warn('FcmService.disablePush: failed (ignored):', err);
      }
    }
    // On native, the signed-out member's badge and banners (chat previews) must not stay on a
    // shared device. Safe at any time, so no stillThisLogout guard; best effort, never throws.
    if (Capacitor.isNativePlatform()) await clearNativeBadgeAndTray();
  }

  /**
   * Start the push session of a newly signed-in uid: clears the logout latch set by disablePush.
   * Called by MatrixInitializationService's per-uid effect when currentUser changes to a uid it
   * has not registered yet (after a logout, currentUser goes null first, so the same member
   * signing in again counts as new). Also bumps the generation, so a registration that started
   * inside the logout window drops its result instead of writing for the previous member.
   * No-op without a preceding logout.
   */
  beginSession(): void {
    if (!this.loggedOut) return;
    this.loggedOut = false;
    this.generation++;
  }

  private async registerPusher(token: string, generation: number): Promise<void> {
    // Logged out since the caller read the token: register nothing (see generation, loggedOut).
    if (this.loggedOut || generation !== this.generation) return;
    try {
      // Via a Cloud Function so the push-gateway secret and URL never ship in the bundle (S3, SEC-2).
      const registerPusher = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'registerMatrixPusher');
      await registerPusher({
        pushkey: token,
        deviceDisplayName: (navigator.userAgent ?? 'Unknown').substring(0, 100),
        lang: navigator.language || 'de',
        // The app's build tenant, stored on the pusher (the server accepts it only if it is one
        // of the account's tenants).
        tenantId: this.env.tenantId,
      });
      // A logout during the call: disablePush waits for this promise, then unregisters the pusher.
      if (generation === this.generation && this._currentToken === token) this.pusherToken = token;
    } catch (err) {
      console.warn('FcmService.registerPusher: Matrix pusher registration failed (non-critical):', err);
    }
  }

  async registerAndSave(uid: string, allowPrompt = false): Promise<string | null> {
    if (!isBrowser(this.platformId) || this.loggedOut) return null;

    if (Capacitor.isNativePlatform()) {
      return this.registerNativeAndSave(uid, allowPrompt);
    } else {
      return this.registerWebAndSave(uid, allowPrompt);
    }
  }

  /** Native Capacitor (iOS / Android / macOS) — uses APNs / FCM native SDK. */
  private async registerNativeAndSave(uid: string, allowPrompt: boolean): Promise<string | null> {
    const generation = this.generation;
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

      // Android: our HIGH-importance, lock-screen-private channel (see ensureNativePushChannel).
      // Never throws, so a device without channels (API < 26) still registers its token.
      await ensureNativePushChannel();

      // The listeners must be in place before register(): iOS does not retain the event.
      await this.ensureNativeListeners();

      // Overlapping calls of the same session share the registration in flight.
      const pending = this.pendingNative;
      if (pending && pending.uid === uid && pending.generation === generation) return pending.promise;
      // A registration of an earlier session is still waiting: it ends now, without a token.
      if (pending) this.settlePendingNative(pending, null);

      const next = this.startPendingNative(uid, generation);
      this.nativeSession = { uid, generation };
      try {
        // register() triggers the 'registration' event with the native FCM/APNs token
        await PushNotifications.register();
      } catch (error) {
        console.warn('FcmService.registerNativeAndSave: register() failed:', error);
        this.settlePendingNative(next, null);
      }
      return next.promise;
    } catch (error) {
      console.warn('FcmService.registerNativeAndSave: Failed:', error);
      return null;
    }
  }

  /** Install the permanent native listener pair once; a failed install is retried by the next call. */
  private ensureNativeListeners(): Promise<void> {
    this.nativeListeners ??= Promise.all([
      PushNotifications.addListener('registration', tokenData => this.onNativeRegistration(tokenData.value)),
      PushNotifications.addListener('registrationError', err => this.onNativeRegistrationError(err)),
    ]).then(() => undefined, (error: unknown) => {
      this.nativeListeners = undefined;
      throw error;
    });
    return this.nativeListeners;
  }

  private startPendingNative(uid: string, generation: number): PendingNativeRegistration {
    let resolve!: (token: string | null) => void;
    const promise = new Promise<string | null>(r => { resolve = r; });
    const pending: PendingNativeRegistration = {
      uid, generation, promise, resolve,
      timer: setTimeout(() => {
        if (this.pendingNative !== pending) return;
        console.warn('FcmService: no native push token within the timeout; giving up for now');
        this.settlePendingNative(pending, null);
      }, NATIVE_REGISTRATION_TIMEOUT_MS),
    };
    this.pendingNative = pending;
    return pending;
  }

  /** End a pending registration: clear it (if still current) and resolve its callers. */
  private settlePendingNative(pending: PendingNativeRegistration, token: string | null): void {
    clearTimeout(pending.timer);
    if (this.pendingNative === pending) this.pendingNative = undefined;
    pending.resolve(token);
  }

  /**
   * A native token event. With a registration waiting, it is that registration's answer.
   * Otherwise it is a refresh (N6, e.g. the iOS AppDelegate posting a rotated FCM token): saved
   * for the last registering session, and the Matrix pusher follows only if the previous token
   * had one. Both saves drop a
   * token of a session that ended (saveTokenUnlessLoggedOut).
   */
  private async onNativeRegistration(token: string): Promise<void> {
    const pending = this.pendingNative;
    if (pending) {
      // Cleared at once, so a second event during the save is treated as a refresh.
      clearTimeout(pending.timer);
      this.pendingNative = undefined;
      let saved = false;
      try {
        saved = await this.saveTokenUnlessLoggedOut(pending.uid, token, pending.generation);
        if (saved) console.log('FcmService: Native push token registered and saved');
      } catch (e) {
        console.warn('FcmService: Failed to save native token', e);
      }
      this.settlePendingNative(pending, saved ? token : null);
      return;
    }
    const session = this.nativeSession;
    if (!session) return;
    // Only move a pusher this session already had: a member without chat (no Matrix account,
    // chat blocked, 1.107) must not get one here. Otherwise initializeMatrix registers it for
    // the new token once chat is open.
    const hadPusher = this.pusherToken !== undefined;
    try {
      if (!(await this.saveTokenUnlessLoggedOut(session.uid, token, session.generation))) return;
      console.log('FcmService: refreshed native push token saved');
      if (hadPusher) await this.ensureMatrixPusher();
    } catch (e) {
      console.warn('FcmService: Failed to save refreshed native token', e);
    }
  }

  private onNativeRegistrationError(err: unknown): void {
    console.warn('FcmService: Native push registration error', err);
    const pending = this.pendingNative;
    if (pending) this.settlePendingNative(pending, null);
  }

  /** Web / PWA — uses Firebase Messaging + VAPID key + service worker. */
  private async registerWebAndSave(uid: string, allowPrompt: boolean): Promise<string | null> {
    const generation = this.generation;
    const vapidKey = this.env.services.fcmVapidKey;
    if (!vapidKey) {
      console.warn('FcmService.registerWebAndSave: fcmVapidKey not configured in environment');
      return null;
    }
    // Only wait while the init is still running: an await here on the prompt path would run
    // requestPermission() outside the user's tap. Once initialised this stays synchronous.
    if (!this.messaging) await this.messagingReady;
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
      if (!(await this.saveTokenUnlessLoggedOut(uid, token, generation))) return null;
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
      await deleteDoc(doc(db, 'users', uid, 'fcmTokens', fcmTokenDocId(token)));
    } catch (error) {
      console.warn('FcmService.removeToken: Failed to remove token:', error);
    }
  }

  /**
   * Listen for foreground messages (when app is open).
   * Background messages are handled by the service worker (firebase-messaging-sw.js).
   */
  listenForMessages(): Observable<any> {
    // Subscribed at bootstrap, possibly before Messaging is initialised: attach once it is.
    // Emits nothing where Messaging is unsupported.
    return new Observable(subscriber => {
      let unsubscribe: (() => void) | undefined;
      let closed = false;
      void this.messagingReady.then(messaging => {
        if (!messaging || closed) return;
        unsubscribe = onMessage(messaging, (payload) => subscriber.next(payload));
      });
      return () => { closed = true; unsubscribe?.(); };
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

  /**
   * Save the token and adopt it as _currentToken, but only while the push session that started
   * the registration is still current. Checked before the write (no doc for a session that already
   * ended) and after it (a logout during the write): then the doc is deleted again — while still
   * signed in, because disablePush waits for this promise (savesInFlight). The final check and the
   * adoption are one synchronous step, so no logout can slip in between. Same-client Firestore
   * writes apply in order.
   * @return true when the token is saved and adopted for the current session
   */
  private saveTokenUnlessLoggedOut(uid: string, token: string, generation: number): Promise<boolean> {
    const save = (async () => {
      if (this.loggedOut || generation !== this.generation) return false;
      await this.saveToken(uid, token);
      if (!this.loggedOut && generation === this.generation) {
        this._currentToken = token;
        return true;
      }
      await this.removeToken(uid, token);
      return false;
    })();
    this.savesInFlight.add(save);
    void save.finally(() => this.savesInFlight.delete(save)).catch(() => undefined);
    return save;
  }

  private async saveToken(uid: string, token: string): Promise<void> {
    const db = getFirestore(getApp());
    const tokenDocId = fcmTokenDocId(token);
    await setDoc(
      doc(db, 'users', uid, 'fcmTokens', tokenDocId),
      { token, updatedAt: serverTimestamp(), platform: pushTokenPlatform() },
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
    if (colon <= 0) return;                      // token without an instance id: nothing to match siblings by
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

/** The platform written on a token doc: the native platform, else 'web' (PWA and browsers). */
function pushTokenPlatform(): PushTokenPlatform {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}
