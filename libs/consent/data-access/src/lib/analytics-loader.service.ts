import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isBrowser } from '@okr/shared-util-core';
import { markAnalyticsInitStarted } from '@okr/shared-util-angular';
import { ConsentService } from './consent.service';

type FirebaseAnalytics = import('firebase/analytics').Analytics;

/** Wait for the browser to go idle before touching analytics — never compete with bootstrap. */
const IDLE_TIMEOUT_MS = 5000;

/**
 * Retry delays after a start that could not happen (device offline, `getAnalytics` threw).
 * Three attempts, then we stop: analytics is non-essential and a device that has been
 * unreachable for two minutes will get its analytics on the next page load.
 */
const RETRY_DELAYS_MS = [10_000, 60_000];

@Injectable({ providedIn: 'root' })
export class AnalyticsLoaderService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly consentService = inject(ConsentService);
  private analytics: FirebaseAnalytics | undefined;
  private attempt = 0;
  private starting = false;

  public init(): void {
    if (!isBrowser(this.platformId)) return;
    this.consentService.consent$.subscribe(state => {
      if (state.analytics) {
        this.scheduleEnable();
      } else {
        void this.disableAnalytics();
      }
    });
  }

  /**
   * Start analytics off the critical path.
   *
   * It used to run straight out of the APP_BOOTSTRAP_LISTENER, so on a slow mobile
   * connection its dynamic-config fetch raced the app's own startup requests — and when it
   * lost, the SDK's unowned promise chain rejected into `onunhandledrejection` (SCS-A8).
   * Nothing waits for analytics, so it can just as well wait for an idle moment, and for
   * the device to actually be online.
   */
  private scheduleEnable(delayMs = 0): void {
    if (this.analytics || this.starting) return;
    this.starting = true;
    const start = () => this.whenIdle(() => void this.enableAnalytics());
    if (delayMs > 0) setTimeout(start, delayMs); else start();
  }

  private whenIdle(run: () => void): void {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof idle === 'function') idle(run, { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(run, IDLE_TIMEOUT_MS);
  }

  /**
   * Retry a start we never got to make. Note the deliberate limit of what "failure" can
   * mean here: `getAnalytics()` returns synchronously and swallows the outcome of its own
   * config fetch, so a *later* failure inside the SDK is invisible to us and cannot be
   * retried — only a refused start (offline, or a throw) can. The window marked in
   * `enableAnalytics` is what keeps that invisible failure out of Sentry.
   */
  private retryLater(): void {
    this.starting = false;
    const delay = RETRY_DELAYS_MS[this.attempt];
    this.attempt += 1;
    if (delay === undefined) return;

    if (globalThis.navigator?.onLine === false) {
      globalThis.addEventListener?.('online', () => this.scheduleEnable(), { once: true });
      return;
    }
    this.scheduleEnable(delay);
  }

  private async enableAnalytics(): Promise<void> {
    if (this.analytics) return;
    if (globalThis.navigator?.onLine === false) {
      this.retryLater();
      return;
    }
    try {
      const { getAnalytics, isSupported, setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      if (!(await isSupported())) return;
      const { getApp } = await import('firebase/app');
      // From here the SDK starts a promise chain we never see again — tell Sentry that an
      // anonymous rejection in the next few seconds belongs to analytics, not to the app.
      markAnalyticsInitStarted();
      this.analytics = getAnalytics(getApp());
      setAnalyticsCollectionEnabled(this.analytics, true);
      this.starting = false;
    } catch {
      // analytics is non-essential — fail silently, try again later
      this.retryLater();
    }
  }

  private async disableAnalytics(): Promise<void> {
    if (!this.analytics) return;
    try {
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      setAnalyticsCollectionEnabled(this.analytics, false);
    } catch {
      // analytics is non-essential — fail silently
    }
  }
}
