import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonContent, IonFooter, IonInput, IonItem, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ScsMemberFeesModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-scs-member-fee-invoice-id-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HeaderComponent,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton, IonItem, IonInput,
  ],
  template: `
    <bk-header title="@finance.scsMemberFee.operation.download.enterInvoiceId" [isModal]="true" />
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
          <ion-button color="medium" (click)="cancel()">Abbrechen</ion-button>
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

  public fee = input.required<ScsMemberFeesModel>();

  protected invoiceId = '';

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  public async confirm(): Promise<void> {
    await this.modalController.dismiss({ invoiceId: this.invoiceId }, 'confirm');
  }
}
