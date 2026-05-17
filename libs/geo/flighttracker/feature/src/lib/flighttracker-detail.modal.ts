import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Header } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { FlightInfoResponse } from '@bk2/flighttracker-data-access';

@Component({
  selector: 'bk-flighttracker-detail-modal',
  standalone: true,
  imports: [
    AsyncPipe, DecimalPipe, TranslatePipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonItem, IonLabel
  ],
  template: `
    <bk-header title="@flighttracker.detail.title" [isModal]="true" />
    <ion-content>
      <ion-grid>
        <!-- Departure -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none" color="primary">
              <ion-label><strong>{{ '@flighttracker.detail.departure' | translate | async }}</strong></ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.airport' | translate | async }}: {{ data().departure.airport }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().departure.iata }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.terminal' | translate | async }}: {{ data().departure.terminal ?? '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.gate' | translate | async }}: {{ data().departure.gate ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.delay' | translate | async }}: {{ data().departure.delay != null ? (data().departure.delay + ' min') : '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.scheduled' | translate | async }}: {{ departureScheduled()  }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.estimated' | translate | async }}: {{ departureEstimated() }}</ion-label></ion-item></ion-col>
        </ion-row>

        <!-- Arrival -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none" color="primary">
              <ion-label><strong>{{ '@flighttracker.detail.arrival' | translate | async }}</strong></ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.airport' | translate | async }}: {{ data().arrival.airport }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().arrival.iata }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.terminal' | translate | async }}: {{ data().arrival.terminal ?? '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.gate' | translate | async }}: {{ data().arrival.gate ?? '—' }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.delay' | translate | async }}: {{ data().arrival.delay != null ? (data().arrival.delay + ' min') : '—' }}</ion-label></ion-item></ion-col>
          <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.scheduled' | translate | async }}: {{ arrivalScheduled() }}</ion-label></ion-item></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.estimated' | translate | async }}: {{ arrivalEstimated() }}</ion-label></ion-item></ion-col>
        </ion-row>

        <!-- Aircraft (hidden if null) -->
        @if (data().aircraft) {
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ '@flighttracker.detail.aircraft' | translate | async }}</strong></ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="6"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.registration' | translate | async }}: {{ data().aircraft!.registration ?? '—' }}</ion-label></ion-item></ion-col>
            <ion-col size="6"><ion-item lines="none"><ion-label>IATA: {{ data().aircraft!.iata ?? '—' }}</ion-label></ion-item></ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12"><ion-item lines="none"><ion-label>ICAO24: {{ data().aircraft!.icao24 ?? '—' }}</ion-label></ion-item></ion-col>
          </ion-row>
        }

        <!-- Live Position (hidden if null) -->
        @if (data().live) {
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ '@flighttracker.detail.live' | translate | async }}</strong></ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.altitude' | translate | async }}: {{ data().live!.altitude | number:'1.0-0' }} ft</ion-label></ion-item></ion-col>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.direction' | translate | async }}: {{ data().live!.direction }}°</ion-label></ion-item></ion-col>
            <ion-col size="4"><ion-item lines="none"><ion-label>{{ '@flighttracker.detail.speed' | translate | async }}: {{ data().live!.speed_horizontal | number:'1.0-0' }} kn</ion-label></ion-item></ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `
})
export class FlightDetailModal {
  private modalController = inject(ModalController);

  public data = input.required<FlightInfoResponse>();
  protected departureScheduled = computed(() => this.getPrettyDate(this.data().departure.scheduled));
  protected departureEstimated = computed(() => this.getPrettyDate(this.data().departure.estimated));
  protected arrivalScheduled = computed(() => this.getPrettyDate(this.data().arrival.scheduled));
  protected arrivalEstimated = computed(() => this.getPrettyDate(this.data().arrival.estimated));

  protected close(): void {
    this.modalController.dismiss();
  }

  getPrettyDate(isoDate?: string): string {
    if (!isoDate || isoDate.length < 16) return ' - ';
    const date = isoDate.substring(0, 10);
    const time = isoDate.substring(11,16);
    return convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.ViewDate) + ' ' + time;
  }
}
