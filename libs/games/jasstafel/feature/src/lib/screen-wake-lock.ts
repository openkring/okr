/** The subset of the Screen Wake Lock API used here (not in every TS lib.dom yet). */
type WakeLockSentinelLike = { released: boolean; release(): Promise<void> };
type WakeLockLike = { request(type: 'screen'): Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen from dimming and locking while `wanted` (Screen Wake Lock API: Chrome/Android,
 * Safari and iOS PWAs from 16.4, WKWebView from 18.4). The browser drops the lock whenever the page
 * is hidden, so it is taken again on every return to the foreground. Where the API is missing or
 * refuses (low battery, policy), nothing happens and the device's own timeout applies.
 */
export class ScreenWakeLock {
  private wanted = false;
  private sentinel: WakeLockSentinelLike | undefined;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') void this.acquire();
  };

  public setWanted(wanted: boolean): void {
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    if (typeof document === 'undefined') return;
    if (wanted) {
      document.addEventListener('visibilitychange', this.onVisibility);
      void this.acquire();
    } else {
      document.removeEventListener('visibilitychange', this.onVisibility);
      const sentinel = this.sentinel;
      this.sentinel = undefined;
      void sentinel?.release().catch(() => undefined);
    }
  }

  private async acquire(): Promise<void> {
    const wakeLock = (typeof navigator !== 'undefined' ? (navigator as { wakeLock?: WakeLockLike }).wakeLock : undefined);
    if (!wakeLock || !this.wanted || (this.sentinel && !this.sentinel.released)) return;
    try {
      const sentinel = await wakeLock.request('screen');
      // released again while the request was in flight
      if (this.wanted) this.sentinel = sentinel;
      else await sentinel.release();
    } catch {
      // refused (hidden page, battery saver, policy): the device's own timeout applies
    }
  }
}
