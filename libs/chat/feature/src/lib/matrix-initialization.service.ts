import { ApplicationRef, computed, createComponent, EnvironmentInjector, inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { filter, switchMap, take, tap } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { MatrixChatService } from '@okr/chat-data-access';
import { FcmService, writeBadgeLedgerFromPage } from '@okr/shared-data-access';
import { isKioskOnly } from '@okr/shared-util-core';

import { KioskCallWindow } from './kiosk-call-window';
import { MatrixChatStore } from './matrix-chat.store';

/**
 * Service to initialize Matrix chat early in the app lifecycle.
 * This runs after user authentication and prepares Matrix before the user navigates to chat.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixInitializationService {
  private readonly appStore = inject(AppStore);
  private readonly matrixService = inject(MatrixChatService);
  private readonly matrixChatStore = inject(MatrixChatStore);
  private readonly fcmService = inject(FcmService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private initializationStarted = false;
  private kioskCallWindowMounted = false;

  /**
   * Start watching for user authentication and initialize Matrix when ready.
   * This is called once during app bootstrap.
   */
  startEarlyInitialization(): void {
    if (this.initializationStarted) {
      return;
    }
    
    this.initializationStarted = true;
    console.log('MatrixInitializationService: Starting early initialization watcher');

    // Watch for user authentication (runInInjectionContext needed when called from APP_BOOTSTRAP_LISTENER)
    runInInjectionContext(this.injector, () => toObservable(this.appStore.currentUser))
      .pipe(
        filter(user => !!user), // Wait for user to be authenticated
        take(1), // Only initialize once
        tap(user => console.log('MatrixInitializationService: User authenticated, initializing Matrix for', user.personKey)),
        switchMap(() => this.initializeMatrix())
      )
      .subscribe({
        next: () => console.log('MatrixInitializationService: Early initialization completed'),
        error: (error) => console.error('MatrixInitializationService: Early initialization failed', error)
      });
  }

  /**
   * Mount the floating call window on a kiosk device, once, outside the router outlet, so an
   * auto-answered admin call is visible on top of the Logbuch without taking it over.
   * Non-kiosk users never get it — they answer calls in the chat view as before.
   */
  private mountKioskCallWindow(): void {
    if (this.kioskCallWindowMounted || !isKioskOnly(this.appStore.currentUser())) return;
    this.kioskCallWindowMounted = true;
    const ref = createComponent(KioskCallWindow, { environmentInjector: this.environmentInjector });
    this.appRef.attachView(ref.hostView);
    document.body.appendChild(ref.location.nativeElement);
  }

  /**
   * Initialize Matrix chat by getting credentials and starting the client.
   */
  private async initializeMatrix(): Promise<void> {
    try {
      // ARCH-1: single promise-cached path (fetch credentials via CF + start client),
      // shared with the chat component so the two never race to mint two Matrix tokens.
      // Idempotent — returns immediately if already initialized.
      await this.matrixService.ensureInitialized();

      console.log('MatrixInitializationService: Matrix client initialized successfully');

      this.mountKioskCallWindow();

      // Register for FCM push notifications and wire up the Matrix push gateway.
      // Awaited so the token is available for pusher registration below.
      const uid = getAuth(getApp()).currentUser?.uid;
      if (uid && this.fcmService.isSupported()) {
        const fcmToken = await this.fcmService.registerAndSave(uid).catch(err => {
          console.warn('MatrixInitializationService: FCM registration failed (non-critical):', err);
          return null;
        });

        // Register an HTTP pusher with Synapse so background messages reach this device
        // even when the app is not running. Done via a Cloud Function (registerMatrixPusher)
        // so the push-gateway shared secret and the /_matrix/push/v1/notify URL are built
        // server-side and never ship in the client bundle (S3 + SEC-2).
        if (fcmToken) {
          try {
            const registerPusher = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'registerMatrixPusher');
            await registerPusher({
              pushkey: fcmToken,
              deviceDisplayName: (navigator.userAgent ?? 'Unknown').substring(0, 100),
              lang: navigator.language || 'de',
            });
            console.log('MatrixInitializationService: Matrix HTTP pusher registered');
          } catch (err) {
            console.warn('MatrixInitializationService: Failed to register Matrix pusher (non-critical):', err);
          }
        }
      }

      if (Capacitor.isNativePlatform()) {
        // Native iOS/Android: PushNotifications fires when app is open (foreground).
        // The OS suppresses the notification banner on native foreground — navigate directly.
        PushNotifications.addListener('pushNotificationReceived', notification => {
          const data = notification.data as Record<string, string> | undefined;
          if (data?.['type'] !== 'video-call') return;
          const url = data['url'];
          if (url) {
            this.router.navigateByUrl(url);
          }
        });

        // Native: tapping a notification when app was backgrounded/closed
        PushNotifications.addListener('pushNotificationActionPerformed', action => {
          const data = action.notification.data as Record<string, string> | undefined;
          const url = data?.['url'];
          if (url) {
            this.router.navigateByUrl(url);
          }
        });
      } else {
        // Web / PWA: foreground FCM messages (service worker doesn't show a banner when app is open).
        this.fcmService.listenForMessages().subscribe(payload => {
          if (payload?.data?.['type'] !== 'video-call') return;
          const callerName = payload.data['callerName'] ?? 'Unbekannt';
          const roomName   = payload.data['roomName']   ?? '';
          const url        = payload.data['url']        as string | undefined;

          // Show a notification via the service worker — works on all platforms including iOS Safari.
          // new Notification() from the main thread is blocked on iOS and unreliable on Android
          // when a service worker is active; SW.showNotification() is the correct cross-platform API.
          // Through the FCM worker's registration, not `ready` (ngsw): only the FCM worker's
          // notificationclick opens `data.url`.
          if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            this.fcmService.getPushRegistration().then(sw => {
              sw?.showNotification(`📹 Video-Anruf von ${callerName}`, {
                body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
                icon: `${this.appStore.services.imgixBaseUrl()}/tenant/${this.appStore.tenantId()}/logo/logo-master.png?w=192&h=192&fm=png&auto=`,
                tag: 'video-call',
                requireInteraction: true,
                data: { url },
              } as NotificationOptions);
            }).catch(() => {});
          }

          // Navigate directly to the chat page so the user lands on the call
          if (url) {
            this.router.navigateByUrl(url);
          }
        });

        // A tapped notification whose worker could not route the open window itself
        // (see focusOrOpen in firebase-messaging-sw.js).
        this.fcmService.notificationClicks().subscribe(url => this.router.navigateByUrl(url));

        // Close chat banners for rooms that are no longer unread. Nothing else ever closes a
        // displayed notification (only notificationclick does), so a DM the user already read
        // or answered — here or on another device — kept sitting in the OS notification centre.
        // Synapse's clearing push is dropped server-side (matrixPushGateway), so this is the
        // only signal. Video-call banners are left alone: they ring with requireInteraction.
        const closeReadNotifications = async () => {
          if (!('serviceWorker' in navigator)) return;
          // The FCM worker's registration: the banners are its own, ngsw's lists none of them.
          const reg = await this.fcmService.getPushRegistration().catch(() => undefined);
          // Safari on macOS only exposes getNotifications() in an installed PWA (SCS-4N).
          if (!reg || typeof reg.getNotifications !== 'function') return;
          const unread = new Set(this.matrixChatStore.unreadRooms().map(r => r.roomId));
          for (const n of await reg.getNotifications()) {
            const data = n.data as { type?: string; roomId?: string } | undefined;
            if (data?.type === 'chat' && data.roomId && !unread.has(data.roomId)) n.close();
          }
        };
        runInInjectionContext(this.injector, () =>
          toObservable(this.matrixChatStore.unreadRooms).subscribe(() => closeReadNotifications())
        );
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') closeReadNotifications();
        });

        // Keep the PWA app icon badge in sync with the total notification count.
        // This covers the foreground case; the service worker handles the background case.
        //
        // The total is chat unread + open assigned tasks + unanswered invitations, matching the main-menu badge
        // (MenuStore.notificationCount) exactly. setAppBadge writes an ABSOLUTE value, so a
        // writer that knows only its own half silently destroys the other's: this used to
        // publish the chat count alone, which meant opening the PWA cleared a task-driven
        // badge (resume reconcile → clearAppBadge) while the tasks were still open.
        if ('setAppBadge' in navigator) {
          const applyBadge = (count: number) => {
            const nav = navigator as Navigator & {
              setAppBadge?: (n: number) => Promise<void>;
              clearAppBadge?: () => Promise<void>;
            };
            if (count > 0) {
              nav.setAppBadge?.(count).catch(() => {});
            } else {
              nav.clearAppBadge?.().catch(() => {});
            }
          };

          const badgeParts = computed(() => ({
            chat: this.matrixChatStore.totalUnreadCount(),
            tasks: this.appStore.openTaskCount(),
            invitations: this.appStore.openInvitationCount(),
          }), { equal: (a, b) => a.chat === b.chat && a.tasks === b.tasks && a.invitations === b.invitations });
          const badgeTotal = computed(() => {
            const parts = badgeParts();
            return parts.chat + parts.tasks + parts.invitations;
          });

          runInInjectionContext(this.injector, () =>
            toObservable(badgeTotal).subscribe(applyBadge)
          );
          // Hand the parts to the push service worker's badge ledger (spec 1.93): a push only
          // knows its own part, so the worker needs the other two to write the right total
          // while the app is closed.
          runInInjectionContext(this.injector, () =>
            toObservable(badgeParts).subscribe(parts => void writeBadgeLedgerFromPage(parts))
          );

          // Reconcile the badge whenever the PWA becomes visible again. A background push
          // (or a message read on another device) can leave the OS icon badge out of sync
          // with the real unread count while the app is closed — the reported "badge won't
          // disappear after reading" bug. Forcing it back to the true total on resume fixes
          // that; if Matrix hasn't finished syncing yet, the totalUnreadCount subscription
          // above corrects it again once the count settles.
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              applyBadge(badgeTotal());
            }
          });
        }
      }

    } catch (error) {
      console.error('MatrixInitializationService: Failed to initialize Matrix', error);
      // Don't throw - this is a background initialization, shouldn't break the app
    }
  }
}
