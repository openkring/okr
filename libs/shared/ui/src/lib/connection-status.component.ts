// connection-status-button.component.ts
import { Component, signal } from '@angular/core';
import { bkTranslate } from '@bk2/shared-i18n';
import { Network } from '@capacitor/network';
import { AlertController, IonButton, IonicSafeString } from '@ionic/angular/standalone';

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
export class ConnectionStatusButtonComponent {
  private alertCtrl = new AlertController();
  private status = signal<Status>('online');

  protected color = signal('#4caf50'); // default green

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
    const title = bkTranslate('@menu.connection.title');
    const intro = bkTranslate('@menu.connection.intro');
    const good = bkTranslate('@menu.connection.good');
    const goodExplanation = bkTranslate('@menu.connection.goodExplanation');
    const slow = bkTranslate('@menu.connection.slow');
    const slowExplanation = bkTranslate('@menu.connection.slowExplanation');
    const offline = bkTranslate('@menu.connection.offline');
    const offlineExplanation = bkTranslate('@menu.connection.offlineExplanation');
    const message = new IonicSafeString(`
      <div style="text-align: left; font-size: 14px; line-height: 1.5;">
        <p style="margin: 0 0 16px 0;">${intro}</p>

        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div style="background:#4caf50; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${good}</strong><br>
                ${goodExplanation}
            </div>
        </div>

        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            <div style="background:#ff9800; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${slow}</strong><br>
                ${slowExplanation}
            </div>
        </div>

        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="background:#f44336; width:18px; height:18px; border-radius:50%; flex-shrink:0; margin-top: 2px;"></div>
            <div>
                <strong>${offline}</strong><br>
                ${offlineExplanation}
            </div>
        </div>
    </div>
        `);
    const alert = await this.alertCtrl.create({
      header: title,
      message,
      buttons: ['OK'],
      cssClass: 'connection-alert'
    });
    await alert.present();
  }
}