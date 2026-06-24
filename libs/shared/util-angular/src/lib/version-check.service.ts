import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isBrowser } from './platform.util';
import { AlertController } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { doc, onSnapshot } from 'firebase/firestore';

import { FIRESTORE } from '@bk2/shared-config';

import packageJson from '../../../../../package.json';

export interface AppVersionConfig {
  minVersion: string;
  latestVersion: string;
  forceUpdate?: boolean;
}

export const AppVersionCollection = 'app-version';  // same for collection and document id

/** How often to ask the service worker to check the server for a new deployment. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly alertController = inject(AlertController);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  public readonly firestore = inject(FIRESTORE);

  private readonly currentVersion = packageJson.version;
  private versionConfig: AppVersionConfig | undefined;
  private alertShown = false;

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getLatestVersion(): string | undefined {
    return this.versionConfig?.latestVersion;
  }

  /**
   * Wire up update notifications.
   *
   * The authoritative trigger is the service worker's VERSION_READY event: it
   * fires only once a freshly deployed build has actually been downloaded and is
   * ready to activate on THIS device. Prompting off that event (rather than off a
   * version-string mismatch) makes the update reliably applicable — activating it
   * and reloading always lands the user on the new version, so the prompt can
   * never loop. (The old design compared package.json against a Firestore version
   * and called location.reload(); but a plain reload does not activate a waiting
   * SW, so the cached old bundle was re-served and the modal reappeared forever.)
   *
   * The Firestore `app-version` document is kept only as out-of-band policy: it
   * supplies the human-readable version string for the message and the
   * force-update rule (forceUpdate flag, or running version below minVersion).
   */
  checkVersion(): void {
    if (!isBrowser(this.platformId)) return;

    this.listenToVersionConfig();
    this.listenForServiceWorkerUpdates();
  }

  /** Keep the latest force-update policy / display version from Firestore. */
  private listenToVersionConfig(): void {
    const configDoc = doc(this.firestore, AppVersionCollection, AppVersionCollection);
    onSnapshot(configDoc, (snapshot) => {
      const config = snapshot.data() as AppVersionConfig | undefined;
      if (config) this.versionConfig = config;
    }, (error) => {
      console.error('VersionCheckService: Firestore listener error:', error);
    });
  }

  /** Prompt when the service worker has a new version downloaded and ready. */
  private listenForServiceWorkerUpdates(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        void this.promptForUpdate();
      } else if (evt.type === 'VERSION_INSTALLATION_FAILED') {
        console.error('VersionCheckService: failed to install the new version:', evt.error);
      }
    });

    // Periodically ask the SW to look for a new deployment, so long-lived sessions
    // get notified without needing a manual reload.
    setInterval(() => {
      this.swUpdate.checkForUpdate().catch((error) => {
        console.error('VersionCheckService: checkForUpdate failed:', error);
      });
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  private async promptForUpdate(): Promise<void> {
    if (this.alertShown) return; // a prompt is already open — don't stack alerts
    this.alertShown = true;

    const config = this.versionConfig;
    const latestVersion = config?.latestVersion;
    const forceUpdate = config?.forceUpdate === true ||
      (config?.minVersion !== undefined && this.compareVersions(this.currentVersion, config.minVersion) < 0);

    const versionText = latestVersion ? `Eine neue Version (${latestVersion})` : 'Eine neue Version';
    const message = `${versionText} der App ist verfügbar. Du verwendest aktuell Version ${this.currentVersion}. Bitte aktualisiere die App, um die neuesten Funktionen und Verbesserungen zu nutzen.`;
    const alert = await this.alertController.create({
      header: 'Update verfügbar',
      message,
      backdropDismiss: !forceUpdate,
      buttons: forceUpdate ? [
        {
          text: 'Jetzt aktualisieren',
          role: 'confirm'
        }
      ] : [
        {
          text: 'Später',
          role: 'cancel'
        },
        {
          text: 'Jetzt aktualisieren',
          role: 'confirm'
        }
      ]
    });

    await alert.present();
    const { role } = await alert.onWillDismiss();
    this.alertShown = false; // allow a future (newer) VERSION_READY to prompt again
    if (role === 'confirm') {
      await this.activateAndReload();
    }
  }

  /**
   * Activate the version the service worker already downloaded, then reload so the
   * page is served by the new version. activateUpdate() is the step a plain
   * location.reload() omits — without it the old cached bundle keeps being served.
   */
  private async activateAndReload(): Promise<void> {
    try {
      if (this.swUpdate.isEnabled) {
        await this.swUpdate.activateUpdate();
      }
    } catch (error) {
      console.error('VersionCheckService: failed to activate the new version:', error);
    }
    window.location.reload();
  }
}
