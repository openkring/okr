import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isBrowser } from './platform.util';
import { AlertController } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { doc, onSnapshot } from 'firebase/firestore';

import { ENV, FIRESTORE } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';

import packageJson from '../../../../../package.json';

export interface AppVersionConfig {
  minVersion: string;
  latestVersion: string;
  forceUpdate?: boolean;
  /**
   * What is actually live per app, keyed by `environment.appId` ('scs', 'p13', …).
   *
   * Apps deploy on their own cadence out of one monorepo version, so `latestVersion` — a single
   * number for the whole fleet — names a build that may never have been deployed to *this* app.
   * The map is display truth; `latestVersion` stays as the fallback for installations that don't
   * maintain it. `minVersion`/`forceUpdate` deliberately stay global: only raise `minVersion` to a
   * version that has been deployed to every app, or you force clients toward a build they cannot get.
   */
  deployed?: Record<string, string>;
}

export const AppVersionCollection = 'app-version';  // same for collection and document id

/** How often to ask the service worker to check the server for a new deployment. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Minimum spacing between checks triggered by foreground/visibility events, so
 * rapid tab/app switches don't hammer the server with hash-manifest requests.
 */
const MIN_FOREGROUND_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * sessionStorage key recording when we last auto-reloaded because the service
 * worker declared its state unrecoverable (see handleUnrecoverableState).
 */
export const UNRECOVERABLE_RELOAD_KEY = 'okr-unrecoverable-reload-at';

/** Never auto-reload twice within this window — guards against a reload loop. */
const UNRECOVERABLE_RELOAD_MIN_INTERVAL_MS = 60 * 1000; // 1 minute

@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly alertController = inject(AlertController);
  // Main-bundle keys (no scope): they are in memory at startup, which this service needs.
  private readonly updateI18n = inject(I18nService).translateAll({
    header: '@appUpdate.header', message: '@appUpdate.message',
    messageWithVersion: '@appUpdate.messageWithVersion', now: '@appUpdate.now', later: '@appUpdate.later',
  });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  public readonly firestore = inject(FIRESTORE);

  /** Which app this build is, so the deployed-version map can be read for it. */
  private readonly appId = inject(ENV, { optional: true })?.appId ?? '';
  private readonly currentVersion = packageJson.version;
  private versionConfig: AppVersionConfig | undefined;
  private alertShown = false;
  private lastCheckAt = 0;

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /** The version live for THIS app, falling back to the fleet-wide `latestVersion`. */
  getLatestVersion(): string | undefined {
    const config = this.versionConfig;
    return config?.deployed?.[this.appId] ?? config?.latestVersion;
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
        // set-env.js stamps the build version into ngsw-config.json's appData, so the incoming
        // manifest names the version we are about to activate — no Firestore round trip needed.
        const version = (evt.latestVersion.appData as { version?: string } | undefined)?.version;
        void this.promptForUpdate(version);
      } else if (evt.type === 'VERSION_INSTALLATION_FAILED') {
        console.error('VersionCheckService: failed to install the new version:', evt.error);
      }
    });

    // The SW declares its state unrecoverable when an asset of the running
    // version is neither in its cache nor on the server anymore (typical after a
    // deploy replaced the hashed chunk files while this client kept the old
    // version open). Lazy `@defer`/route chunks then fail to load (NG0750), so
    // the only way forward is a reload, which fetches the current deployment.
    this.swUpdate.unrecoverable.subscribe((event) => {
      this.handleUnrecoverableState(event.reason);
    });

    // Check immediately on startup. On iOS the home-screen PWA is suspended/killed
    // while backgrounded, so the periodic interval below almost never ticks; the
    // launch + foreground checks are what actually surface a new deployment there.
    this.checkForUpdate();

    // Re-check whenever the app returns to the foreground (tab focus / PWA resume).
    // This is the reliable trigger on iOS, where each relaunch fires visibilitychange.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.checkForUpdate();
    });

    // Still poll periodically so long-lived foreground sessions get notified too.
    setInterval(() => this.checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
  }

  /** Ask the SW to look for a new deployment, throttled to avoid request storms. */
  private checkForUpdate(): void {
    if (!this.swUpdate.isEnabled) return;
    const now = Date.now();
    if (now - this.lastCheckAt < MIN_FOREGROUND_CHECK_INTERVAL_MS) return;
    this.lastCheckAt = now;
    this.swUpdate.checkForUpdate().catch((error) => {
      console.error('VersionCheckService: checkForUpdate failed:', error);
    });
  }

  /**
   * Recover from an unrecoverable service-worker state by reloading once.
   * A sessionStorage timestamp guards against a reload loop in case the state
   * persists across reloads (e.g. server unreachable).
   */
  private handleUnrecoverableState(reason: string): void {
    console.error(`VersionCheckService: service worker state is unrecoverable (${reason}); reloading to fetch the current version`);
    const lastReloadAt = Number(sessionStorage.getItem(UNRECOVERABLE_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReloadAt < UNRECOVERABLE_RELOAD_MIN_INTERVAL_MS) return;
    sessionStorage.setItem(UNRECOVERABLE_RELOAD_KEY, String(Date.now()));
    this.reloadPage();
  }

  /** Wrapper around location.reload so tests can intercept the reload. */
  protected reloadPage(): void {
    window.location.reload();
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

  /**
   * @param incomingVersion version the service worker just downloaded, read from the new build's
   * own manifest (ngsw appData). Undefined for builds made before that stamp existed.
   */
  private async promptForUpdate(incomingVersion?: string): Promise<void> {
    if (this.alertShown) return; // a prompt is already open — don't stack alerts
    this.alertShown = true;

    const config = this.versionConfig;
    // Prefer the incoming build's own version. The Firestore fallback lags — `deployed.<appId>`
    // is set by hand after the hosting deploy — so it can still name the version we already run;
    // then quote nothing ("new version 7.13.2 available, you run 7.13.2") and use the plain message.
    const configured = incomingVersion ?? this.getLatestVersion();
    const latestVersion = configured && this.compareVersions(configured, this.currentVersion) > 0
      ? configured : undefined;
    const forceUpdate = config?.forceUpdate === true ||
      (config?.minVersion !== undefined && this.compareVersions(this.currentVersion, config.minVersion) < 0);

    const i18n = this.updateI18n;
    const message = latestVersion
      ? fill(i18n.messageWithVersion(), { latest: latestVersion, current: this.currentVersion })
      : fill(i18n.message(), { current: this.currentVersion });
    const alert = await this.alertController.create({
      header: i18n.header(),
      message,
      backdropDismiss: !forceUpdate,
      buttons: forceUpdate ? [
        {
          text: i18n.now(),
          role: 'confirm'
        }
      ] : [
        {
          text: i18n.later(),
          role: 'cancel'
        },
        {
          text: i18n.now(),
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
