import { DestroyRef, effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Device } from '@capacitor/device';

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
}

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
): KioskStatus {
  return {
    uid,
    tenants,
    device: `${info.model} · ${info.operatingSystem} ${info.osVersion} (${info.platform})`,
    batteryLevel: battery.batteryLevel === undefined ? -1 : Math.round(battery.batteryLevel * 100),
    charging: battery.isCharging ?? false,
    seen,
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
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    effect(() => {
      const currentUser = this.appStore.currentUser();
      // currentUser resolves a moment after fbUser; roles are only known once it does.
      if (!currentUser || !isKioskOnly(currentUser) || !isBrowser(this.platformId)) return;
      if (this.timer) return; // already reporting
      void this.report();
      this.timer = setInterval(() => void this.report(), REPORT_INTERVAL_MS);
    });
  }

  private async report(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const uid = this.appStore.fbUser()?.uid;
    if (!uid || !currentUser) return;
    try {
      const [info, battery] = await Promise.all([Device.getInfo(), Device.getBatteryInfo()]);
      const status = toKioskStatus(uid, currentUser.tenants, info, battery, new Date().toISOString());
      await this.firestoreService.createObject(KioskStatusCollection, uid, status);
    } catch (ex) {
      // never break the kiosk UI over telemetry
      console.error('KioskStatusService.report -> ERROR:', ex);
    }
  }
}
