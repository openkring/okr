// libs/esign/feature/src/lib/esign-delete-confirm.modal.ts
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, ModalController } from '@ionic/angular/standalone';
import { EsignRecord } from '@bk2/shared-models';

@Component({
  selector: 'bk-esign-delete-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Delete</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Cancel</ion-button>
          <ion-button color="danger" (click)="confirm()">Delete</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content></ion-content>
  `,
})
export class EsignDeleteConfirmModal {
  public readonly esign = input.required<EsignRecord>();
  private readonly modalController = inject(ModalController);

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  protected confirm(): void {
    this.modalController.dismiss(null, 'confirm');
  }
}
