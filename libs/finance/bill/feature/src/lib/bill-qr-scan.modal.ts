import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel,
  IonTextarea, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';

@Component({
  selector: 'bk-bill-qr-scan-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonTextarea,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>QR-Rechnung scannen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Abbrechen</ion-button>
          <ion-button (click)="parse()" [disabled]="!qrContent">Verarbeiten</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">QR-Inhalt (aus Kamera oder manuell)</ion-label>
        <ion-textarea [(ngModel)]="qrContent" rows="10" placeholder="SPC&#10;0200&#10;..." />
      </ion-item>
      @if (error) { <p style="color:red">{{ error }}</p> }
    </ion-content>
  `,
})
export class BillQrScanModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly functions = (() => {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.appStore.env.useEmulators) {
      connectFunctionsEmulator(fns, 'localhost', 5001);
    }
    return fns;
  })();

  protected qrContent = '';
  protected error = '';

  protected async parse(): Promise<void> {
    this.error = '';
    try {
      const fn = httpsCallable<{ qrContent: string }, unknown>(this.functions, 'parseQrInvoice');
      const result = await fn({ qrContent: this.qrContent });
      await this.modalController.dismiss(result.data, 'confirm');
    } catch (err) {
      this.error = (err as Error).message;
    }
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
