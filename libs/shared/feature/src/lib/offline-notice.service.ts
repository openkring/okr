import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { isBrowserOffline } from '@okr/shared-util-core';

const PFX = '@shared/feature.';

/**
 * Tells the user that the app has no network, while it has none.
 *
 * Offline, Firestore serves what it still holds and maps everything else to an empty list, so an
 * empty view reads as "no records" rather than "not available offline" (see the `offline` skill).
 * A persistent toast for the duration of the outage closes that gap for every screen at once.
 * Started once from AppStore's onInit (browser only).
 */
@Injectable({ providedIn: 'root' })
export class OfflineNoticeService {
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);
  private toast: HTMLIonToastElement | undefined;
  private started = false;

  public start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('offline', () => void this.showOffline());
    window.addEventListener('online', () => void this.showOnline());
    // A wake from sleep can deliver 'offline' but never the matching 'online': re-check whenever
    // the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => this.sync());
    if (isBrowserOffline()) void this.showOffline();
  }

  /** Drop the offline toast if the browser is online again (also called by WakeWatchdogService). */
  public sync(): void {
    if (this.toast && !isBrowserOffline()) void this.showOnline();
  }

  private async showOffline(): Promise<void> {
    if (this.toast) return;
    // translate() waits for the lazy scope to load; the SW serves it offline once cached.
    const message = await firstValueFrom(this.i18nService.translate(PFX + 'offline.notice'));
    if (!isBrowserOffline() || this.toast) return;   // back online while the text loaded
    this.toast = await this.toastController.create({
      message,
      position: 'bottom',
      color: 'dark',
      swipeGesture: 'vertical',
    });
    void this.toast.onDidDismiss().then(() => this.toast = undefined);
    await this.toast.present();
    // 'online' may have fired while the toast was being created; showOnline() saw no toast then.
    this.sync();
  }

  private async showOnline(): Promise<void> {
    if (!this.toast) return;
    await this.toast.dismiss();
    const message = await firstValueFrom(this.i18nService.translate(PFX + 'offline.online'));
    const toast = await this.toastController.create({ message, position: 'bottom', duration: 2000 });
    await toast.present();
  }
}
