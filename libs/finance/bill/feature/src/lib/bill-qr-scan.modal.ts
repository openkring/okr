import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel,
  IonTextarea, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BILL_I18N_KEYS, BillI18n } from '@okr/finance-bill-util';

@Component({
  selector: 'okr-bill-qr-scan-modal',
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
        <ion-title>{{ i18n.qr_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ i18n.cancel() }}</ion-button>
          <ion-button (click)="parse()" [disabled]="!qrContent">{{ i18n.qr_process() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">{{ i18n.qr_content_label() }}</ion-label>
        <ion-textarea [(ngModel)]="qrContent" rows="10" [placeholder]="i18n.qr_content_placeholder()" />
      </ion-item>
      @if (error) { <p style="color:red">{{ error }}</p> }
    </ion-content>
  `,
})
export class BillQrScanModal {
  protected readonly i18n = inject(I18nService).translateAll(BILL_I18N_KEYS) as BillI18n;
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
