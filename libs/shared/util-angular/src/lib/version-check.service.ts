import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AlertController } from '@ionic/angular/standalone';
import { doc, getDoc } from 'firebase/firestore';

import { FIRESTORE } from '@bk2/shared-config';
import { bkTranslate } from '@bk2/shared-i18n';

import packageJson from '../../../../../package.json';

export interface AppVersionConfig {
  minVersion: string;
  latestVersion: string;
  forceUpdate?: boolean;
}

export const AppVersionCollection = 'app-version';  // same for collection and document id

@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly alertController = inject(AlertController);
  private readonly platformId = inject(PLATFORM_ID);
  public readonly firestore = inject(FIRESTORE);

  private readonly currentVersion = packageJson.version;
  private versionConfig: AppVersionConfig | undefined;

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getLatestVersion(): string | undefined {
    return this.versionConfig?.latestVersion;
  }
  
  async checkVersion(): Promise<void> {
    // Only check on browser platform
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const configDoc = doc(this.firestore, AppVersionCollection, AppVersionCollection);
      const snapshot = await getDoc(configDoc);
      this.versionConfig = snapshot.data() as AppVersionConfig;

      if (!this.versionConfig) {
        return;
      }

      const needsUpdate = this.compareVersions(this.currentVersion, this.versionConfig.latestVersion) < 0;
      const forceUpdate = this.versionConfig.forceUpdate || this.compareVersions(this.currentVersion, this.versionConfig.minVersion) < 0;

      if (needsUpdate) {
        await this.showUpdateAlert(this.versionConfig.latestVersion, forceUpdate);
      }
    } catch (error) {
      console.error('Error checking app version:', error);
    }
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

  private async showUpdateAlert(latestVersion: string, forceUpdate: boolean): Promise<void> {
    const alert = await this.alertController.create({
      header: bkTranslate('@app.version.update.header'),
      message: bkTranslate('@app.version.update.message', { 
        currentVersion: this.currentVersion,
        latestVersion: latestVersion 
      }),
      backdropDismiss: !forceUpdate,
      buttons: forceUpdate ? [] : [
        {
          text: bkTranslate('@app.version.update.later'),
          role: 'cancel'
        },
        {
          text: bkTranslate('@app.version.update.now'),
          handler: () => {
            this.redirectToStore();
          }
        }
      ]
    });

    if (forceUpdate) {
      alert.buttons = [{
        text: bkTranslate('@app.version.update.now'),
        handler: () => {
          this.redirectToStore();
        }
      }];
    }

    await alert.present();
  }

  /**
   * Redirect user to the appropriate app store based on their platform.
   * This is prepared for mobile apps but currently just reloads the web app.
   */
  private redirectToStore(): void {
//    const userAgent = navigator.userAgent || navigator.vendor;
    
/*     // iOS
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      window.location.href = 'https://apps.apple.com/app/your-app-id'; // TODO: Update with your App Store URL
    }
    // Android
    else if (/android/i.test(userAgent)) {
      window.location.href = 'https://play.google.com/store/apps/details?id=your.package.name'; // TODO: Update with your Play Store URL
    }
    // Web/PWA
    else { */
      window.location.reload();
    // }
  }
}
