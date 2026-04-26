import { Component, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SrvIndex, SrvMismatch } from './aoc-srv.store';

@Component({
  selector: 'bk-aoc-srv-mismatch-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="warning">
        <ion-title>Abweichungen: {{ item().firstName }} {{ item().lastName }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="3"><strong>Feld</strong></ion-col>
          <ion-col size="4"><strong>BK</strong></ion-col>
          <ion-col size="5"><strong>Regasoft</strong></ion-col>
        </ion-row>
        @for(m of mismatches(); track m.field) {
          <ion-row>
            <ion-col size="3">{{ m.field }}</ion-col>
            <ion-col size="4" style="color: var(--ion-color-danger)">{{ m.bkValue || '—' }}</ion-col>
            <ion-col size="5" style="color: var(--ion-color-success)">{{ m.rValue || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class AocSrvMismatchModal {
  private readonly modalController = inject(ModalController);

  public item       = input.required<SrvIndex>();
  public mismatches = input.required<SrvMismatch[]>();

  protected async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
