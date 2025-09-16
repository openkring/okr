import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Service to track browser online/offline status using Signals.
 * Usage:
 * - `isOnlineSignal() returns true/false for online status`
 * - `onlineStatus() returns 'online'/'offline' string`
 */
@Injectable({
  providedIn: 'root',
})
export class NetworkStatusService {
  private platformId = inject(PLATFORM_ID);
  private isOnlineSignal = signal<boolean>(false);
  private onlineStatusSignal = signal<'online' | 'offline'>('offline');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize with current online status
      this.isOnlineSignal.set(navigator.onLine);
      this.onlineStatusSignal.set(navigator.onLine ? 'online' : 'offline');

      // Update signals on online/offline events
      effect(() => {
        const handleOnline = () => {
          this.isOnlineSignal.set(true);
          this.onlineStatusSignal.set('online');
        };
        const handleOffline = () => {
          this.isOnlineSignal.set(false);
          this.onlineStatusSignal.set('offline');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Cleanup effect
        return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      });
    } else {
      console.warn('isOnline/onlineStatus: not in browser, setting to false/offline');
      this.isOnlineSignal.set(false);
      this.onlineStatusSignal.set('offline');
    }
  }

  // Expose the boolean signal
  get isOnline() {
    return this.isOnlineSignal.asReadonly();
  }

  // Expose the string signal
  get onlineStatus() {
    return this.onlineStatusSignal.asReadonly();
  }
}