import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { filter, switchMap, take, tap } from 'rxjs/operators';

import { AppStore } from '@bk2/shared-feature';
import { MatrixChatService } from '@bk2/chat-data-access';
import { FcmService } from '@bk2/shared-data-access';

interface MatrixAuthToken {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

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
  private readonly fcmService = inject(FcmService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private initializationStarted = false;

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
   * Initialize Matrix chat by getting credentials and starting the client.
   */
  private async initializeMatrix(): Promise<void> {
    try {
      // Check if already initialized
      if (this.matrixService.isInitialized) {
        console.log('MatrixInitializationService: Matrix already initialized');
        return;
      }

      // Get Matrix credentials (from cache or Cloud Function)
      const credentials = await this.getMatrixCredentials();
      if (!credentials) {
        throw new Error('Failed to get Matrix credentials');
      }

      // Initialize Matrix client
      await this.matrixService.initialize({
        homeserverUrl: credentials.homeserverUrl,
        userId: credentials.userId,
        accessToken: credentials.accessToken,
        deviceId: credentials.deviceId,
      });

      console.log('MatrixInitializationService: Matrix client initialized successfully');

      // Register for FCM push notifications (for incoming call alerts).
      // Non-blocking — a denied permission or missing VAPID key must not break anything.
      const uid = getAuth(getApp()).currentUser?.uid;
      if (uid && this.fcmService.isSupported()) {
        this.fcmService.registerAndSave(uid).catch(err =>
          console.warn('MatrixInitializationService: FCM registration failed (non-critical):', err)
        );
      }

      // Handle foreground FCM messages (app is open; service worker doesn't show a banner).
      this.fcmService.listenForMessages().subscribe(payload => {
        if (payload?.data?.['type'] !== 'video-call') return;
        const callerName = payload.data['callerName'] ?? 'Unbekannt';
        const roomName   = payload.data['roomName']   ?? '';
        const url        = payload.data['url']        as string | undefined;

        // Set badge so the app icon shows an indicator even while the app is open
        if ('setAppBadge' in navigator) {
          (navigator as any).setAppBadge(1).catch(() => {});
        }

        // Navigate directly to the chat page — the user is already in the app
        if (url) {
          this.router.navigateByUrl(url);
        }

        // Also show a native Notification as a visual alert (in case the user is on a different page)
        if (Notification.permission === 'granted') {
          new Notification(`📹 Video-Anruf von ${callerName}`, {
            body: roomName ? `In ${roomName}` : 'Eingehender Video-Anruf',
            icon: '/assets/icons/icon-192x192.png',
            tag: 'video-call',
            requireInteraction: true,
          });
        }
      });

      // Clear the badge when the user returns to the app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && 'clearAppBadge' in navigator) {
          (navigator as any).clearAppBadge().catch(() => {});
        }
      });
    } catch (error) {
      console.error('MatrixInitializationService: Failed to initialize Matrix', error);
      // Don't throw - this is a background initialization, shouldn't break the app
    }
  }

  /**
   * Get Matrix credentials from cache or Cloud Function.
   */
  private async getMatrixCredentials(): Promise<MatrixAuthToken | undefined> {
    const user = this.appStore.currentUser();
    if (!user) {
      console.warn('MatrixInitializationService: No user logged in');
      return undefined;
    }

    try {
      const stored = this.matrixService.getStoredCredentials();
      if (stored) {
        // Validate stored credentials use the person-key-based Matrix ID.
        // Discard and re-fetch if they still reference the old user.bkey.
        const homeserver = this.appStore.env.services.matrixHomeserver
          .replace(/^https?:\/\//, '')
          .replace(/^matrix\./, '');
        const expectedUserId = `@${user.personKey.toLowerCase()}:${homeserver}`;
        if (stored.userId !== expectedUserId) {
          console.log(`MatrixInitializationService: Clearing stale credentials (${stored.userId} → ${expectedUserId})`);
          this.matrixService.clearStoredCredentials();
          // Fall through to CF call below
        } else {
          console.log('MatrixInitializationService: Using cached Matrix token');
          return {
            ...stored,
            homeserverUrl: stored.homeserverUrl || 'https://' + homeserver,
            deviceId: stored.deviceId || `device_${user.personKey.toLowerCase()}`,
          } as MatrixAuthToken;
        }
      }

      console.log('MatrixInitializationService: Requesting Matrix credentials from Cloud Function');
      const functions = getFunctions(getApp(), 'europe-west6');
      const getMatrixCredentials = httpsCallable(functions, 'getMatrixCredentials');
      const result = await getMatrixCredentials();
      const credentials = result.data as MatrixAuthToken;

      if (!credentials || !credentials.accessToken) {
        throw new Error('Cloud Function returned invalid credentials');
      }

      this.matrixService.storeCredentials(credentials);
      console.log('MatrixInitializationService: Successfully got Matrix credentials');
      return credentials;
    } catch (error) {
      console.error('MatrixInitializationService: Failed to get credentials', error);
      this.matrixService.clearStoredCredentials();
      throw error;
    }
  }
}
