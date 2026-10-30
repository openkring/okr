import { ApplicationRef, computed, createComponent, effect, EnvironmentInjector, inject, Injectable, Injector, runInInjectionContext, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { AppStore } from '@okr/shared-feature';
import { MatrixChatService } from '@okr/chat-data-access';
import { ChatStatusService, FcmService, writeBadgeLedgerFromPage } from '@okr/shared-data-access';
import { ChatBlockedError } from '@okr/shared-models';
import { chatBlockedAlertMessage, isKioskOnly, isRegistrationStale, PUSH_PROMPT_SNOOZE_MS, shouldAskForPush } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { CHAT_BLOCKED_ALERT_I18N_KEYS, ChatBlockedAlertI18n, PUSH_PROMPT_I18N_KEYS, PushPromptI18n } from '@okr/chat-util';
import { AlertController } from '@ionic/angular';

import { KioskCallWindow } from './kiosk-call-window';
import { MatrixChatStore } from './matrix-chat.store';

/**
 * Service to initialize Matrix chat early in the app lifecycle.
 * This runs after user authentication and prepares Matrix before the user navigates to chat.
 *
 * Push (FCM token, listeners) and the icon badge do NOT wait for Matrix (1.127): they start at
 * bootstrap, so a blocked or failing chat still leaves task, invitation and calendar pushes
 * working. Only the Matrix pusher (chat pushes) follows once Matrix is in use.
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
  private readonly blockedAlertI18n = inject(I18nService).translateAll(CHAT_BLOCKED_ALERT_I18N_KEYS) as ChatBlockedAlertI18n;
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private readonly chatStatus = inject(ChatStatusService);
  private initializationStarted = false;
  private kioskCallWindowMounted = false;
  /** The uid this device last registered for push; undefined while signed out. */
  private pushUid: string | undefined;
  /** When pushUid last registered successfully (epoch ms); in memory only, see refreshPushIfStale. */
  private pushRegisteredAt: number | undefined;
  /** registerPush calls still running (exact per call); the visibility refresh waits for 0. */
  private pushRegistrationsRunning = 0;

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

    // Independent of Matrix: the tasks and invitations parts must reach the icon badge even when
    // the chat never connects (blocked, credentials or sync failing) or push registration hangs.
    this.startBadgeSync();

    // Independent of Matrix as well (1.127): push listeners and token registration.
    this.startPushSession();

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
          // disconnect() hangs up a running call; tell the user why it ended.
          const hadCall = this.matrixService.hasActiveCall();
          void this.matrixService.disconnect();
          if (hadCall) void this.showCallEndedByBlockAlert();
        }
        // 'none' (logout): MatrixChatService disconnects and wipes the cache on its own.
      });
    }));
  }

  /**
   * After login: if push is undecided on this device (native app or installed PWA), ask in-app
   * before the system prompt — iOS shows that one only once. «Erlauben» is the user gesture the
   * system prompt needs, so its handler starts the registration synchronously — the
   * permission request must run inside the tap, not after the alert's dismiss animation.
   * «Später» (and a backdrop tap) snoozes for PUSH_PROMPT_SNOOZE_MS on this device.
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
        {
          text: i18n.allow(),
          role: 'confirm',
          // Not awaited: enablePush runs synchronously up to Notification.requestPermission(),
          // so the prompt is reached inside the click (1.127).
          handler: () => {
            void this.registerPush(uid, true).catch(err =>
              console.warn('MatrixInitializationService: push registration after prompt failed:', err));
          },
        },
      ],
    });
    await alert.present();
    const { role } = await alert.onWillDismiss();
    if (role !== 'confirm') {
      try { localStorage.setItem(snoozeKey, String(Date.now() + PUSH_PROMPT_SNOOZE_MS)); } catch { /* best effort */ }
    }
  }

  /**
   * Register this device's push token for uid. The Matrix pusher follows only once Matrix is up
   * and chat is open: chatGate() reads 'open' while the block status is still loading, and the
   * Synapse account may not exist yet on a first login. If Matrix comes up later,
   * initializeMatrix adds the pusher (ensureMatrixPusher); this covers the other ordering.
   */
  private async registerPush(uid: string, allowPrompt: boolean): Promise<string | null> {
    // No await before enablePush: on the prompt path it must reach requestPermission() in the tap.
    this.pushRegistrationsRunning++;
    try {
      const token = await this.fcmService.enablePush(uid, allowPrompt, false);
      if (token && this.matrixService.isInitialized && this.chatGate() === 'open') await this.fcmService.ensureMatrixPusher();
      if (token && uid === this.pushUid) this.pushRegisteredAt = Date.now();
      return token;
    } finally {
      this.pushRegistrationsRunning--;
    }
  }

  /**
   * Silent daily refresh for long-lived sessions (1.127): the token doc's updatedAt moves only on
   * a registration (app start), and the morning job prunes tokens unused for 60 days together
   * with their Matrix pushers — so an always-open desktop PWA or a native app that only ever
   * resumes would lose push while still running. (The kiosk iPad stays fresh through its 5-minute
   * idle reload, a cold start.) Runs when the app becomes visible again (Capacitor fires
   * visibilitychange on native resume too), only with permission already granted, and never
   * prompts.
   */
  private async refreshPushIfStale(): Promise<void> {
    const uid = this.pushUid;
    if (!uid || this.pushRegistrationsRunning > 0 || !isRegistrationStale(this.pushRegisteredAt, Date.now())) return;
    if (await this.fcmService.getPermissionState() !== 'granted') return;
    if (uid !== this.pushUid || this.pushRegistrationsRunning > 0) return; // signed out or started meanwhile
    await this.registerPush(uid, false);
  }

  /**
   * Keep the PWA app icon badge in sync with the total notification count (foreground case; the
   * service worker handles the background case).
   *
   * The total is chat unread + open assigned tasks + unanswered invitations, matching the main-menu
   * badge (MenuStore.notificationCount) exactly. setAppBadge writes an ABSOLUTE value, so a writer
   * that knows only its own part silently destroys the others: this used to publish the chat count
   * alone, which meant opening the PWA cleared a task-driven badge while the tasks were still open.
   *
   * Started from startEarlyInitialization, not after the Matrix client is up: it used to sit behind
   * ensureInitialized and push registration, so a chat that never connected left a stale
   * background badge on the icon forever. The chat part is 0 until the rooms have synced (and while
   * chat is blocked); the subscription corrects the badge once the count settles.
   */
  private startBadgeSync(): void {
    // Native apps badge through apns.aps.badge; only the web / PWA writes the badge here.
    if (Capacitor.isNativePlatform() || !('setAppBadge' in navigator)) return;
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
      chat: this.chatGate() === 'open' ? this.matrixChatStore.totalUnreadCount() : 0,
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
    // Hand the parts to the push service worker's badge ledger (spec 1.93): a push only knows its
    // own part, so the worker needs the other two to write the right total while the app is closed.
    runInInjectionContext(this.injector, () =>
      toObservable(badgeParts).subscribe(parts => void writeBadgeLedgerFromPage(parts))
    );

    // Reconcile the badge whenever the PWA becomes visible again. A background push (or a message
    // read on another device) can leave the OS icon badge out of sync with the real count while the
    // app is closed. Forcing it back to the true total on resume fixes that.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        applyBadge(badgeTotal());
      }
    });
  }

  /**
   * Push listeners and token registration, started at bootstrap and independent of Matrix
   * (1.127): they used to run behind ensureInitialized, so a blocked chat or a failing Matrix
   * login meant no push at all on this device. Listeners attach once, synchronously.
   */
  private startPushSession(): void {
    if (Capacitor.isNativePlatform()) {
      // Native iOS/Android: PushNotifications fires when app is open (foreground).
      // The OS suppresses the notification banner on native foreground — navigate directly.
      PushNotifications.addListener('pushNotificationReceived', notification => {
        const data = notification.data as Record<string, string> | undefined;
        if (data?.['type'] !== 'video-call') return;
        if (this.isChatBlockedForMe()) return; // 1.107: no call to land on while blocked
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
      // Web / PWA: foreground FCM messages. The banner for a push that arrives while a window is
      // visible is shown by the FCM worker's own `push` listener (firebase-messaging-sw.js,
      // 1.127 R3) — it must be shown inside the push event, or iOS counts the push as silent
      // and revokes the subscription. The page only routes a video call to its room.
      this.fcmService.listenForMessages().subscribe(payload => {
        if (payload?.data?.['type'] !== 'video-call') return;
        if (this.isChatBlockedForMe()) return; // 1.107: no navigation to a call while blocked
        const url = payload.data['url'] as string | undefined;

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
        // Subscribed at bootstrap, before Matrix has synced: unreadRooms() is [] until then, so
        // without this guard every chat banner would be closed as "read". isInitialized alone is
        // not enough — it is true right after startClient — and neither is PREPARED: with the
        // IndexedDB cache PREPARED fires first for the cache replay, whose unread counts predate
        // the banners that arrived while the app was closed. Only SYNCING (a live /sync after
        // PREPARED) reflects what was read here or on another device.
        if (!this.matrixService.isInitialized) return;
        if (this.matrixChatStore.syncState() !== 'SYNCING') return;
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
      // Re-run on unread changes AND when the live sync arrives: the unread list may already be
      // settled from the cache replay, so the transition to SYNCING alone must trigger a pass.
      const unreadAfterLiveSync = computed(() => ({
        live: this.matrixChatStore.syncState() === 'SYNCING',
        unread: this.matrixChatStore.unreadRooms(),
      }), { equal: (x, y) => x.live === y.live && x.unread === y.unread });
      runInInjectionContext(this.injector, () =>
        toObservable(unreadAfterLiveSync).subscribe(() => closeReadNotifications())
      );
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') closeReadNotifications();
      });
    }

    // Register for push per signed-in user (FCM token; the Matrix pusher only once Matrix is up,
    // see registerPush). Without a decided permission nothing registers here — iOS and Android 13+
    // need a user gesture — so ask once, in-app first (spec 1.10 Phase 3 follow-up). A logout
    // resets the uid (AuthService.logout removes the token), so the next user registers anew.
    const uid = computed(() => this.appStore.currentUser()?.okey);
    runInInjectionContext(this.injector, () => effect(() => {
      const current = uid();
      untracked(() => {
        if (!current) {
          this.pushUid = undefined;
          this.pushRegisteredAt = undefined;
          return;
        }
        if (current === this.pushUid || !this.fcmService.isSupported()) return;
        this.pushUid = current;
        void this.registerPush(current, false)
          .catch(err => {
            console.warn('MatrixInitializationService: push registration failed (non-critical):', err);
            return null;
          })
          .then(token => token ? undefined : this.askForPushIfUndecided(current))
          .catch(err => console.warn('MatrixInitializationService: push prompt failed:', err));
      });
    }));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void this.refreshPushIfStale()
        .catch(err => console.warn('MatrixInitializationService: push refresh failed (non-critical):', err));
    });
  }

  /** The chat was blocked during a call: the call is gone, show the admin's message. */
  private async showCallEndedByBlockAlert(): Promise<void> {
    const i18n = this.blockedAlertI18n;
    const alert = await this.alertController.create({
      header: i18n.title(),
      // escaped: the admin's message is free text and Ionic renders the alert message as HTML
      message: chatBlockedAlertMessage(this.chatStatus.message(), i18n.default(), i18n.callEnded()),
      buttons: [{ text: i18n.ok(), role: 'cancel' }],
    });
    await alert.present();
  }

  /** True when chat is blocked for the signed-in person (incoming call pushes are ignored then). */
  private isChatBlockedForMe(): boolean {
    return this.chatGate() === 'blocked';
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

      // Blocked while credentials were in flight (the status flipped after the gate passed):
      // the effect saw no running client then, so stop the fresh one here.
      if (this.chatGate() === 'blocked') {
        await this.matrixService.disconnect();
        return;
      }

      console.log('MatrixInitializationService: Matrix client initialized successfully');

      this.mountKioskCallWindow();

      // The Matrix pusher (chat pushes) once Matrix is in use: on the first connect, and again
      // after an unblock. Registers once per token; a no-op before push is enabled on this device.
      await this.fcmService.ensureMatrixPusher();

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
