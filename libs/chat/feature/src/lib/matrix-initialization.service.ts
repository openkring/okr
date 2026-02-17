import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { filter, switchMap, take, tap } from 'rxjs/operators';

import { AppStore } from '@bk2/shared-feature';
import { MatrixChatService } from '@bk2/chat-data-access';

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

    // Watch for user authentication
    toObservable(this.appStore.currentUser)
      .pipe(
        filter(user => !!user), // Wait for user to be authenticated
        take(1), // Only initialize once
        tap(user => console.log('MatrixInitializationService: User authenticated, initializing Matrix for', user.bkey)),
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
      // Check if we have a cached token in localStorage
      const storedToken = localStorage.getItem('matrix_access_token');
      const storedUserId = localStorage.getItem('matrix_user_id');
      const storedDeviceId = localStorage.getItem('matrix_device_id');
      const storedHomeserver = localStorage.getItem('matrix_homeserver');

      if (storedToken && storedUserId) {
        console.log('MatrixInitializationService: Using cached Matrix token');
        return {
          accessToken: storedToken,
          userId: storedUserId,
          deviceId: storedDeviceId || `device_${user.bkey}`,
          homeserverUrl: storedHomeserver || this.appStore.env.services.matrixHomeserver || 'https://matrix.bkchat.etke.host',
        };
      }

      // No cached token - call Cloud Function to get Matrix credentials
      console.log('MatrixInitializationService: Requesting Matrix credentials from Cloud Function');
      
      const functions = getFunctions(getApp(), 'europe-west6');
      const getMatrixCredentials = httpsCallable(functions, 'getMatrixCredentials');
      
      const result = await getMatrixCredentials();
      const credentials = result.data as MatrixAuthToken;

      if (!credentials || !credentials.accessToken) {
        throw new Error('Cloud Function returned invalid credentials');
      }

      // Cache the token for future use
      localStorage.setItem('matrix_access_token', credentials.accessToken);
      localStorage.setItem('matrix_user_id', credentials.userId);
      localStorage.setItem('matrix_device_id', credentials.deviceId);
      localStorage.setItem('matrix_homeserver', credentials.homeserverUrl);

      console.log('MatrixInitializationService: Successfully got Matrix credentials');

      return credentials;
    } catch (error) {
      console.error('MatrixInitializationService: Failed to get credentials', error);
      // Clear any invalid cached tokens
      localStorage.removeItem('matrix_access_token');
      localStorage.removeItem('matrix_user_id');
      localStorage.removeItem('matrix_device_id');
      localStorage.removeItem('matrix_homeserver');
      throw error;
    }
  }
}
