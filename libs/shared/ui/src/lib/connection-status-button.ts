import { Component, inject, signal } from '@angular/core';
import { Network } from '@capacitor/network';
import { AlertController, IonButton, IonicSafeString } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

type Status = 'online' | 'slow' | 'offline';

@Component({
  selector: 'bk-connection-status-button',
  standalone: true,
  imports: [
    IonButton
],
  template: `
    <ion-button
      shape="round"
      size="small"
      fill="clear"
      class="status-btn"
      (click)="showExplanation()"
    >
      <div class="dot" [style.background-color]="color()"></div>
    </ion-button>
  `,
  styles: [`
    .status-btn {
      --padding-start: 0;
      --padding-end: 0;
      width: 44px;
      height: 44px;
    }
    .dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
  `]
})
export class ConnectionStatusButton {

  private readonly alertCtrl = new AlertController();
  private readonly i18nService = inject(I18nService);
  private readonly status = signal<Status>('online');
  protected readonly color = signal('#4caf50');

  // i18n
  private i18n = this.i18nService.translateAll({
    title: PFX + 'connection.title',
    intro:  PFX + 'connection.intro',
    good: PFX + 'connection.good',
    good_explanation:  PFX + 'connection.goodExplanation',
    slow: PFX + 'connection.slow',
    slow_explanation:  PFX + 'connection.slowExplanation',
    offline: PFX + 'connection.offline',
    offline_explanation: PFX + 'connection.offlineExplanation',
    ok: '@ok',
    cancel: '@cancel'
  });

  constructor() {
    // Initial status
    Network.getStatus().then(s => this.updateStatus(s));

    // Listen to changes → updates color instantly (no reload)
    Network.addListener('networkStatusChange', s => this.updateStatus(s));
  }

  private updateStatus(networkStatus: any) {
    let newStatus: Status = 'online';
    if (!networkStatus.connected) {
      newStatus = 'offline';
    } else if (networkStatus.connectionType === 'cellular') {
      const eff = (navigator as any)?.connection?.effectiveType;
      if (['slow-2g', '2g', '3g'].includes(eff)) newStatus = 'slow'; // 4g and 5g is considered good
    }

    this.status.set(newStatus);
    this.color.set(
      newStatus === 'online' ? '#4caf50' :
      newStatus === 'slow' ? '#ff9800' : '#f44336'
    );
  }

  protected async showExplanation() {
    const message = new IonicSafeString(`
      <div style="text-align: left; font-size: 14px; line-height: 1.5;">
        <p style="margin: 0 0 16px 0;">${this.i18n.intro()}</p>

        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div style="background:#4caf50; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${this.i18n.good()}</strong><br>
                ${this.i18n.good_explanation()}
            </div>
        </div>

        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div style="background:#ff9800; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${this.i18n.slow()}</strong><br>
                ${this.i18n.slow_explanation()}
            </div>
        </div>

        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="background:#f44336; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${this.i18n.offline()}</strong><br>
                ${this.i18n.offline_explanation()}
            </div>
        </div>
    </div>
        `);
    const alert = await this.alertCtrl.create({
      header: this.i18n.title(),
      message,
      buttons: [this.i18n.ok()],
      cssClass: 'connection-alert'
    });
    await alert.present();
  }
}