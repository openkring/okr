import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AlertController } from '@ionic/angular/standalone';
import { doc, getDoc } from 'firebase/firestore';

import { FIRESTORE } from '@bk2/shared-config';

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
    const message = `Eine neue Version (${latestVersion}) der App ist verfügbar. Du verwendest aktuell Version ${this.currentVersion}. Bitte aktualisiere die App, um die neuesten Funktionen und Verbesserungen zu nutzen.`;
    const alert = await this.alertController.create({
      header: 'Update verfügbar',
      message,
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
    if (role === 'confirm') {
      window.location.reload();
    }
  }
}
