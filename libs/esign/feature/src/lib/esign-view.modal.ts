// libs/esign/feature/src/lib/esign-view.modal.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonButtons, IonButton, ModalController } from '@ionic/angular/standalone';
import { EsignRecord } from '@bk2/shared-models';

@Component({
  selector: 'bk-esign-view-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ esign().documentName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content></ion-content>
  `,
})
export class EsignViewModal {
  public readonly esign = input.required<EsignRecord>();
  private readonly modalController = inject(ModalController);

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}

import { inject } from '@angular/core';
