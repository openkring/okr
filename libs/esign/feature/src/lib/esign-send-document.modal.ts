// libs/esign/feature/src/lib/esign-send-document.modal.ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, ModalController, ToastController } from '@ionic/angular/standalone';
import { EsignService } from '@bk2/esign-data-access';

@Component({
  selector: 'bk-esign-send-document-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Dokument senden</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content></ion-content>
  `,
})
export class EsignSendDocumentModal {
  public readonly file       = input.required<File>();
  public readonly tenantId   = input.required<string>();
  private readonly modalController  = inject(ModalController);
  private readonly toastController  = inject(ToastController);
  protected readonly esignService   = inject(EsignService);

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
