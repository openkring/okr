// libs/esign/feature/src/lib/esign-send-email.modal.ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, ModalController } from '@ionic/angular/standalone';
import { EsignRecord } from '@bk2/shared-models';

@Component({
  selector: 'bk-esign-send-email-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>E-Mail senden</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content></ion-content>
  `,
})
export class EsignSendEmailModal {
  public readonly esign = input.required<EsignRecord>();
  private readonly modalController = inject(ModalController);

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
