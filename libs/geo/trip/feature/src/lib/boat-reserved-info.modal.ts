import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonContent, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular/standalone';

import { ReservationModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';

import { TripStore } from './trip.store';

/**
 * Read-only explanation of why a boat cannot be taken out: which reason blocks it, the note the
 * resourceAdmin (or the damage reporter) left, and until when. Dismissing it returns the user to
 * the boat picker — the booking continues with a different boat, it is not aborted.
 */
@Component({
  selector: 'okr-boat-reserved-info-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonButton
  ],
  providers: [TripStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.boat_reserved_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-card>
        <ion-card-content>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ reasonText() }}</ion-label>
          </ion-item>
          @if (reservation().notes) {
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <ion-note>{{ store.i18n.boat_reserved_note() }}</ion-note>
                <p>{{ reservation().notes }}</p>
              </ion-label>
            </ion-item>
          }
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ untilText() }}</ion-label>
          </ion-item>
          <ion-button expand="block" (click)="confirm()">{{ store.i18n.boat_reserved_confirm() }}</ion-button>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class BoatReservedInfoModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(TripStore);

  /** the reservation that blocks the boat the user just picked */
  public readonly reservation = input.required<ReservationModel>();

  protected readonly reasonText = computed(() => {
    switch (this.reservation().reason) {
      case 'maintenance': return this.store.i18n.boat_reserved_maintenance();
      case 'blocked':     return this.store.i18n.boat_reserved_blocked();
      default:            return this.store.i18n.boat_reserved_other();
    }
  });

  protected readonly untilText = computed(() => {
    const endDate = this.reservation().endDate;
    if (!endDate || endDate === END_FUTURE_DATE_STR || endDate.startsWith('9999')) {
      return this.store.i18n.boat_reserved_open_end();
    }
    const date = convertDateFormatToString(endDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    return fill(this.store.i18n.boat_reserved_until(), { date });
  });

  protected async confirm(): Promise<void> {
    await this.modalController.dismiss(undefined, 'confirm');
  }
}
