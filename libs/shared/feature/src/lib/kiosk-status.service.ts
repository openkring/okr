import { DestroyRef, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Device } from '@capacitor/device';
import { AlertController } from '@ionic/angular/standalone';
import { doc, onSnapshot } from 'firebase/firestore';

import packageJson from '../../../../../package.json';

import { FirestoreService } from '@okr/shared-data-access';
import { isBrowser, isKioskOnly } from '@okr/shared-util-core';

import { AppStore } from './app.store';

/** Top-level collection, one document per kiosk user, document id = the kiosk user's uid. */
export const KioskStatusCollection = 'kiosk-status';

/** How often a kiosk re-reports. A kiosk runs unattended for days; 15' is plenty. */
const REPORT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * What a kiosk device reports about itself. Not an OkrModel (no okey/name/…) — it is
 * device telemetry, not domain data, and is written with createObject/readObject.
 */
export interface KioskStatus {
  uid: string;
  tenants: string[];
  /** e.g. "iPad13,4 · iPadOS 18.5 (ios)" — so an admin can tell two kiosks apart. */
  device: string;
  /** 0..100, or -1 when the platform does not expose the battery (see caveat below). */
  batteryLevel: number;
  charging: boolean;
  /** ISO timestamp of this report. A stale `seen` means the kiosk is off or offline. */
  seen: string;
  /**
   * The app version running on the device — so an admin sees whether a reload actually updated it.
   * Optional because documents written before this field existed do not carry it: a Firestore read
   * returns the raw stored object, it does not apply defaults.
   */
  version?: string;
  /**
   * Remote reload command, written by an admin (any new value triggers it once). The device
   * clears it implicitly with its next report, which overwrites the whole document.
   */
  reloadAt?: string;
  /** Remote alert: a new timestamp pops `alertMessage` on the device once. */
  alertAt?: string;
  alertMessage?: string;
  /**
   * Seconds after which the device closes the message by itself, counting down on screen.
   * 0 or missing: the message stays until someone presses OK — which on an unattended kiosk
   * may be never, hence this field.
   */
  alertCountdown?: number;
  /** Read-only mode: the device stays up and readable but refuses new/changed entries. */
  locked?: boolean;
}

/** localStorage keys holding the last command timestamp this device already acted on. */
const RELOAD_AT_KEY = 'okr-kiosk-reloaded-at';
const ALERT_AT_KEY = 'okr-kiosk-alerted-at';

/**
 * Builds the report. Pure so it can be unit-tested without Capacitor or Firestore.
 * `battery.batteryLevel` is 0..1 on native and undefined on browsers without the
 * Battery Status API (all of iOS Safari) — undefined must stay distinguishable from
 * an empty battery, hence -1 rather than 0.
 */
export function toKioskStatus(
  uid: string,
  tenants: string[],
  info: { model: string; operatingSystem: string; osVersion: string; platform: string },
  battery: { batteryLevel?: number; isCharging?: boolean },
  seen: string,
  version: string,
  locked = false,
): KioskStatus {
  return {
    uid,
    tenants,
    device: `${info.model} · ${info.operatingSystem} ${info.osVersion} (${info.platform})`,
    batteryLevel: battery.batteryLevel === undefined ? -1 : Math.round(battery.batteryLevel * 100),
    charging: battery.isCharging ?? false,
    seen,
    version,
    // the report overwrites the whole document, so the lock has to be carried forward —
    // otherwise a kiosk would silently unlock itself 15 minutes after being locked
    locked,
  };
}

/**
 * Reports battery level and a heartbeat from a kiosk device so an admin can monitor it
 * remotely (read `kiosk-status/{uid}`). Active only for kiosk-only users (isKioskOnly);
 * every other user is a no-op, so this never writes for a normal member.
 *
 * CAVEAT — battery needs the NATIVE app. `Device.getBatteryInfo()` falls back to the web
 * Battery Status API in a browser, which iOS Safari does not implement (and never will —
 * Apple dropped it over fingerprinting). On an iPad running the app in Safari you get
 * `batteryLevel: -1` and only the heartbeat. Install the Capacitor iOS build on the kiosk
 * iPad to get a real battery reading.
 *
 * Instantiate once after bootstrap (see app.config.ts), like SentryContextService.
 */
@Injectable({ providedIn: 'root' })
export class KioskStatusService {
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly alertController = inject(AlertController);
  private timer?: ReturnType<typeof setInterval>;

  /**
   * Remote read-only mode. Set from `kiosk-status/{uid}.locked`; false for every non-kiosk user,
   * so a screen may gate its write actions on it unconditionally (see TripStore.canWrite).
   */
  public readonly locked = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    effect(() => {
      const currentUser = this.appStore.currentUser();
      // currentUser resolves a moment after fbUser; roles are only known once it does.
      if (!currentUser || !isKioskOnly(currentUser) || !isBrowser(this.platformId)) return;
      if (this.timer) return; // already reporting
      void this.report();
      this.timer = setInterval(() => void this.report(), REPORT_INTERVAL_MS);
      this.listenForCommands();
    });
  }

  /**
   * Remote control from the AOC kiosk screen: an admin writes to `kiosk-status/{uid}` and the
   * unattended device obeys — it has no browser chrome and nobody standing in front of it.
   *
   * - `reloadAt`  a fresh ISO timestamp reloads the page (picking up a new deployment)
   * - `alertAt` + `alertMessage`  pops the message on the device
   * - `locked`  read-only mode, see the `locked` signal
   *
   * The timestamp acted on is remembered in localStorage, so each command fires exactly once and
   * a value still sitting in the document cannot loop the device through reload after reload.
   */
  private listenForCommands(): void {
    const uid = this.appStore.fbUser()?.uid;
    if (!uid) return;
    const statusDoc = doc(this.firestoreService.firestore, KioskStatusCollection, uid);
    onSnapshot(statusDoc, (snapshot) => {
      const status = snapshot.data() as KioskStatus | undefined;
      if (!status) return;
      this.locked.set(status.locked === true);
      if (status.alertAt && localStorage.getItem(ALERT_AT_KEY) !== status.alertAt) {
        localStorage.setItem(ALERT_AT_KEY, status.alertAt);
        void this.showAlert(status.alertMessage ?? '', status.alertCountdown ?? 0);
      }
      // reload last: it tears the page down, so any state above is already persisted
      if (status.reloadAt && localStorage.getItem(RELOAD_AT_KEY) !== status.reloadAt) {
        localStorage.setItem(RELOAD_AT_KEY, status.reloadAt);
        window.location.reload();
      }
    }, (ex) => console.error('KioskStatusService.listenForCommands -> ERROR:', ex));
  }

  /**
   * `countdown` > 0: the remaining seconds are shown under the text and tick down once a
   * second; at 0 the alert closes itself. The interval is also cleared when the user presses
   * OK first, so it cannot outlive the alert.
   */
  private async showAlert(message: string, countdown: number): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Mitteilung',
      message,
      buttons: ['OK'],
    });
    await alert.present();
    if (countdown <= 0) return;

    let remaining = Math.round(countdown);
    alert.message = `${message}\n\n(schliesst in ${remaining} s)`;
    const timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        void alert.dismiss();
        return;
      }
      alert.message = `${message}\n\n(schliesst in ${remaining} s)`;
    }, 1000);
    void alert.onDidDismiss().then(() => clearInterval(timer));
  }

  private async report(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const uid = this.appStore.fbUser()?.uid;
    if (!uid || !currentUser) return;
    try {
      // getBatteryInfo() THROWS (not: returns empty) when `navigator.getBattery` is missing —
      // i.e. on every iOS Safari, which is the kiosk. Inside the Promise.all that rejection
      // took the whole report down with it and no heartbeat was ever written. The battery is
      // the optional half of this document; the heartbeat is the half that matters.
      const [info, battery] = await Promise.all([
        Device.getInfo(),
        Device.getBatteryInfo().catch(() => ({})),
      ]);
      const status = toKioskStatus(
        uid, currentUser.tenants, info, battery, new Date().toISOString(), packageJson.version, this.locked()
      );
      await this.firestoreService.createObject(KioskStatusCollection, uid, status);
    } catch (ex) {
      // never break the kiosk UI over telemetry
      console.error('KioskStatusService.report -> ERROR:', ex);
    }
  }
}
