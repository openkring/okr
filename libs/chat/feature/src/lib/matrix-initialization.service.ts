import { ApplicationRef, computed, createComponent, effect, EnvironmentInjector, inject, Injectable, Injector, runInInjectionContext, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { AppStore } from '@okr/shared-feature';
import { MatrixChatService } from '@okr/chat-data-access';
import { ChatStatusService, FcmService, writeBadgeLedgerFromPage } from '@okr/shared-data-access';
import { ChatBlockedError } from '@okr/shared-models';
import { isKioskOnly, PUSH_PROMPT_SNOOZE_MS, shouldAskForPush } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { PUSH_PROMPT_I18N_KEYS, PushPromptI18n } from '@okr/chat-util';
import { AlertController } from '@ionic/angular';

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
  private readonly alertController = inject(AlertController);
  private readonly pushPromptI18n = inject(I18nService).translateAll(PUSH_PROMPT_I18N_KEYS) as PushPromptI18n;
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private readonly chatStatus = inject(ChatStatusService);
  private initializationStarted = false;
  private kioskCallWindowMounted = false;
  private sessionSetupDone = false;

  /**
   * 1.107 gate state: 'none' (signed out), 'blocked' (chat blocked for this person) or 'open'.
   * A string so the effect below re-runs only on a real flip, not on every user-doc update.
   */
  private readonly chatGate = computed<'none' | 'blocked' | 'open'>(() => {
    const user = this.appStore.currentUser();
    if (!user) return 'none';
    return this.chatStatus.isEffectivelyBlocked(user.personKey) ? 'blocked' : 'open';
  });

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

    // Live transitions (1.107): connect while chat is open for the signed-in user, disconnect
    // (keeping the cache) when an admin blocks it. runInInjectionContext is needed because this
    // is called from APP_BOOTSTRAP_LISTENER. Only chatGate is tracked; the async work is untracked.
    runInInjectionContext(this.injector, () => effect(() => {
      const gate = this.chatGate();
      untracked(() => {
        if (gate === 'open') {
          void this.initializeMatrix();
        } else if (gate === 'blocked' && this.matrixService.isInitialized) {
          console.log('MatrixInitializationService: chat blocked, disconnecting Matrix');
          void this.matrixService.disconnect();
        }
        // 'none' (logout): MatrixChatService disconnects and wipes the cache on its own.
      });
    }));
  }

  /**
   * Mount the floating call window on a kiosk device, once, outside the router outlet, so an
   * auto-answered admin call is visible on top of the Logbuch without taking it over.
   * Non-kiosk users never get it — they answer calls in the chat view as before.
   */
  /**
   * After login: if push is undecided on this device (native app or installed PWA), ask in-app
   * before the system prompt — iOS shows that one only once. «Erlauben» is the user gesture the
   * system prompt needs; «Später» snoozes for PUSH_PROMPT_SNOOZE_MS on this device.
   */
  private async askForPushIfUndecided(uid: string): Promise<void> {
    const snoozeKey = 'okr.pushPrompt.snoozedUntil';
    let snoozedUntil: number | undefined;
    try { snoozedUntil = Number(localStorage.getItem(snoozeKey)) || undefined; } catch { /* storage blocked: ask again */ }
    const isStandalone = typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
    const state = await this.fcmService.getPermissionState();
    if (!shouldAskForPush({ state, isNative: Capacitor.isNativePlatform(), isStandalone, snoozedUntil, now: Date.now() })) return;

    const i18n = this.pushPromptI18n;
    const alert = await this.alertController.create({
      header: i18n.header(),
      message: i18n.message(),
      buttons: [
        { text: i18n.later(), role: 'cancel' },
        { text: i18n.allow(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onWillDismiss();
    if (role === 'confirm') {
      await this.fcmService.enablePush(uid, true).catch(err =>
        console.warn('MatrixInitializationService: push registration after prompt failed:', err));
    } else {
      try { localStorage.setItem(snoozeKey, String(Date.now() + PUSH_PROMPT_SNOOZE_MS)); } catch { /* best effort */ }
    }
  }

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

      // Blocked while credentials were in flight (the status flipped after the gate passed):
      // the effect saw no running client then, so stop the fresh one here.
      if (this.chatGate() === 'blocked') {
        await this.matrixService.disconnect();
        return;
      }

      console.log('MatrixInitializationService: Matrix client initialized successfully');

      this.mountKioskCallWindow();

      // Push registration, listeners and badge sync run once per app lifetime; a reconnect
      // after an unblock (or a token refresh) must not register them a second time.
      if (this.sessionSetupDone) return;
      this.sessionSetupDone = true;

      // Register for push (FCM token + Matrix pusher, see FcmService.enablePush). Without a decided
      // permission nothing registers here — iOS and Android 13+ need a user gesture — so ask once,
      // in-app first (spec 1.10 Phase 3 follow-up).
      const uid = getAuth(getApp()).currentUser?.uid;
      if (uid && this.fcmService.isSupported()) {
        const fcmToken = await this.fcmService.enablePush(uid).catch(err => {
          console.warn('MatrixInitializationService: push registration failed (non-critical):', err);
          return null;
        });
        if (!fcmToken) await this.askForPushIfUndecided(uid);
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
      if (error instanceof ChatBlockedError) {
        console.log('MatrixInitializationService: chat is blocked, Matrix not started');
        return;
      }
      console.error('MatrixInitializationService: Failed to initialize Matrix', error);
      // Don't throw - this is a background initialization, shouldn't break the app
    }
  }
}
