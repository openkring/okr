import { Injectable, inject } from '@angular/core';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { captureMessage } from '@sentry/angular';
import { disableNetwork, doc, enableNetwork, getDocFromServer } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';

import { ENV, FIRESTORE, ensureAppCheckToken } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { AppConfigCollection } from '@okr/shared-models';

import { OfflineNoticeService } from './offline-notice.service';

const PFX = '@shared/feature.';

/** A gap between two heartbeats longer than this means the device slept (or the app was frozen). */
const WAKE_GAP_MS = 5 * 60_000;
const HEARTBEAT_MS = 20_000;
/** How long to wait for the network after a wake before giving up until the next trigger. */
const NETWORK_WAIT_MS = 3 * 60_000;
const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 5_000;
const HEALTH_TIMEOUT_MS = 10_000;
/** Never auto-reload twice within this window — a reload that does not heal must not loop. */
const RELOAD_GUARD_MS = 5 * 60_000;
const RELOAD_GUARD_KEY = 'okr.wakeWatchdog.lastReload';

/**
 * Heals the app after the device slept (spec: the 2026-10-06 investigation in the `offline` skill).
 *
 * Observed live on macOS (PWA and browser tab alike): after a long sleep — especially one that
 * crosses a network change — the page does not recover on its own. Firestore, Firebase Auth and
 * Matrix stop logging entirely (no retries, no new errors), the offline toast stays, pages render
 * as 404 and the menu spins. A manual reload always heals it. Because Matrix is frozen as well,
 * the stuck layer sits below Firestore, so nudging one SDK is not enough.
 *
 * After a wake (heartbeat gap, or visibility/online/focus after a long pause) this service:
 * 1. waits until the network is really reachable — a same-origin request that bypasses the
 *    Angular service worker (`ngsw-bypass`), independent of `navigator.onLine`;
 * 2. asks Firestore for one document from the server (bounded); if that fails it resets the
 *    Firestore network once and asks again;
 * 3. if the app is still stuck, reloads it — or, with a modal open (possible unsaved input),
 *    offers the reload in a toast instead.
 *
 * Started once from AppStore's onInit (browser only).
 */
@Injectable({ providedIn: 'root' })
export class WakeWatchdogService {
  private readonly firestore = inject(FIRESTORE);
  private readonly env = inject(ENV);
  private readonly offlineNotice = inject(OfflineNoticeService);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);

  private lastAlive = Date.now();
  /** Set by a detected wake; stays set until a check succeeded, so the next trigger retries. */
  private wakePending = false;
  private running = false;
  private started = false;

  public start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    setInterval(() => this.onTrigger('heartbeat'), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.onTrigger('visible');
    });
    window.addEventListener('online', () => this.onTrigger('online'));
    window.addEventListener('focus', () => this.onTrigger('focus'));
    window.addEventListener('pageshow', () => this.onTrigger('pageshow'));
  }

  private onTrigger(source: string): void {
    const now = Date.now();
    const gapMs = now - this.lastAlive;
    this.lastAlive = now;
    if (gapMs >= WAKE_GAP_MS) this.wakePending = true;
    if (!this.wakePending || this.running || document.visibilityState !== 'visible') return;
    void this.recover(source, gapMs);
  }

  private async recover(source: string, gapMs: number): Promise<void> {
    this.running = true;
    try {
      if (!await this.waitForNetwork()) return;   // still really offline: the next trigger retries
      this.offlineNotice.sync();

      if (await this.firestoreHealthy()) {
        this.wakePending = false;
        return;
      }
      // One cheap repair before the big hammer: restart Firestore's streams and backoff.
      await withTimeout(disableNetwork(this.firestore).then(() => enableNetwork(this.firestore)), HEALTH_TIMEOUT_MS);
      if (await this.firestoreHealthy()) {
        this.wakePending = false;
        return;
      }
      await this.reload(source, gapMs);
    } finally {
      this.running = false;
      this.lastAlive = Date.now();
    }
  }

  /** Probe until the origin answers (any HTTP status counts) or NETWORK_WAIT_MS has passed. */
  private async waitForNetwork(): Promise<boolean> {
    const deadline = Date.now() + NETWORK_WAIT_MS;
    while (Date.now() < deadline) {
      if (await this.probe()) return true;
      await new Promise(resolve => setTimeout(resolve, PROBE_INTERVAL_MS));
    }
    return false;
  }

  private async probe(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      // ngsw-bypass: the Angular service worker must not answer (it fakes a 504 when offline,
      // and it is a suspect in the hang itself). Any response proves the network is up.
      await fetch(`/ngsw.json?ngsw-bypass=true&wake=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** One bounded server read of this tenant's app-config: exercises App Check, auth and the stream. */
  private async firestoreHealthy(): Promise<boolean> {
    await ensureAppCheckToken(PROBE_TIMEOUT_MS);
    return withTimeout(
      getDocFromServer(doc(this.firestore, AppConfigCollection, this.env.tenantId)).then(() => true),
      HEALTH_TIMEOUT_MS,
    );
  }

  private async reload(source: string, gapMs: number): Promise<void> {
    const context = { tags: { wakeSource: source }, extra: { gapMinutes: Math.round(gapMs / 60_000) } };
    if (await this.hasOpenOverlay()) {
      captureMessage('WakeWatchdog: app stuck after wake, overlay open — offering reload', { level: 'warning', ...context });
      await this.offerReload();
      return;
    }
    if (Date.now() - readLastReload() < RELOAD_GUARD_MS) {
      captureMessage('WakeWatchdog: app stuck after wake, reload guard active — offering reload', { level: 'warning', ...context });
      await this.offerReload();
      return;
    }
    captureMessage('WakeWatchdog: app stuck after wake — reloading', { level: 'warning', ...context });
    writeLastReload(Date.now());
    window.location.reload();
  }

  private async hasOpenOverlay(): Promise<boolean> {
    const [modal, alert] = await Promise.all([this.modalController.getTop(), this.alertController.getTop()]);
    return !!modal || !!alert;
  }

  private async offerReload(): Promise<void> {
    const [message, button] = await Promise.all([
      firstValueFrom(this.i18nService.translate(PFX + 'offline.stuck')),
      firstValueFrom(this.i18nService.translate(PFX + 'offline.reload')),
    ]);
    const toast = await this.toastController.create({
      message,
      position: 'bottom',
      color: 'dark',
      buttons: [{ text: button, handler: () => { writeLastReload(Date.now()); window.location.reload(); } }],
    });
    await toast.present();
  }
}

/** Resolve to the promise's value, or to false when it rejects or takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | false> {
  return Promise.race([
    promise.catch(() => false as const),
    new Promise<false>(resolve => setTimeout(() => resolve(false), ms)),
  ]);
}

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastReload(value: number): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(value));
  } catch {
    /* no sessionStorage: the guard is best-effort */
  }
}
