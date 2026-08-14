import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonFooter, IonInput, IonItem, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ScsMemberFeesModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';

@Component({
  selector: 'okr-scs-member-fee-invoice-id-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Header,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonItem, IonInput,
  ],
  template: `
    <okr-header [i18n]="{ title: '@finance.scsMemberFee.operation.download.enterInvoiceId' }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item lines="none">
        <ion-input
          label="Bexio Invoice ID"
          labelPlacement="floating"
          fill="outline"
          type="number"
          inputmode="numeric"
          placeholder="z.B. 12345"
          [(ngModel)]="invoiceId"
        />
      </ion-item>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button color="medium" (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button color="primary" [disabled]="!invoiceId" (click)="confirm()">OK</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class ScsMemberFeeInvoiceIdModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll({ cancel: '@cancel' });

  public fee = input.required<ScsMemberFeesModel>();

  protected invoiceId = '';

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  public async confirm(): Promise<void> {
    await this.modalController.dismiss({ invoiceId: this.invoiceId }, 'confirm');
  }
}
