import { Component, inject } from '@angular/core';
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe, PrettyDatePipe } from '@okr/shared-pipes';
import { EmptyList, Header, Spinner } from '@okr/shared-ui';
import { KioskStatus } from '@okr/shared-feature';

import { getTodayStr } from '@okr/shared-util-core';

import { formatBattery, formatSeenAge, isKioskOnline } from '@okr/aoc-util';
import { formatTripTime } from '@okr/trip-util';

import { AocKioskStore } from './aoc-kiosk.store';

/**
 * AOC screen for the tenant's kiosk devices: monitoring (heartbeat, battery, running version)
 * and the remote operations an unattended tablet needs — reload, message, lock, video call.
 *
 * German labels are hardcoded, like the neighbouring AOC screens (Daten, Storage, …): this is an
 * admin-only console, it is not translated.
 */
@Component({
  selector: 'okr-aoc-kiosk',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, Header, Spinner, EmptyList,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonButton, IonIcon, IonBadge, IonList, IonItem, IonLabel,
  ],
  providers: [AocKioskStore],
  styles: [`
    .metric { display: flex; flex-direction: column; }
    .metric .value { font-size: 1.2rem; font-weight: 600; }
    .metric .caption { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.kiosk_title() }" />
    <ion-content>
      <ion-button fill="clear" (click)="store.refresh()">
        <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" /> Aktualisieren
      </ion-button>

      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (store.kiosks().length === 0) {
        <okr-empty-list [message]="store.i18n.kiosk_empty()" />
      }

      @for (kiosk of store.kiosks(); track kiosk.uid) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ kiosk.device }}
              @if (online(kiosk)) {
                <ion-badge color="success">online</ion-badge>
              } @else {
                <ion-badge color="danger">offline</ion-badge>
              }
              @if (kiosk.locked) {
                <ion-badge color="warning">gesperrt</ion-badge>
              }
            </ion-card-title>
            <ion-card-subtitle>{{ kiosk.uid }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="6" sizeMd="3">
                  <div class="metric">
                    <span class="value">{{ seenAge(kiosk) }}</span>
                    <span class="caption">letztes Lebenszeichen</span>
                  </div>
                </ion-col>
                <ion-col size="6" sizeMd="3">
                  <div class="metric">
                    <span class="value">{{ battery(kiosk) }}{{ kiosk.charging ? ' ⚡' : '' }}</span>
                    <span class="caption">Batterie</span>
                  </div>
                </ion-col>
                <ion-col size="6" sizeMd="3">
                  <div class="metric">
                    <span class="value">{{ kiosk.version ?? '?' }}</span>
                    <span class="caption">geladene Version</span>
                  </div>
                </ion-col>
                <ion-col size="6" sizeMd="3">
                  <div class="metric">
                    <span class="value">{{ store.todaysTrips().length }}</span>
                    <span class="caption">Fahrten heute</span>
                  </div>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <ion-button fill="outline" (click)="store.reloadKiosk(kiosk)">
                    <ion-icon slot="start" src="{{ 'reload' | svgIcon }}" /> Neu laden
                  </ion-button>
                  <ion-button fill="outline" (click)="store.sendAlert(kiosk)">
                    <ion-icon slot="start" src="{{ 'mail' | svgIcon }}" /> Mitteilung
                  </ion-button>
                  <ion-button fill="outline" (click)="store.callKiosk(kiosk)">
                    <ion-icon slot="start" src="{{ 'video' | svgIcon }}" /> Videoanruf
                  </ion-button>
                  <ion-button [color]="kiosk.locked ? 'warning' : 'medium'" fill="outline" (click)="store.toggleLock(kiosk)">
                    <ion-icon slot="start" src="{{ (kiosk.locked ? 'lock-open' : 'lock-closed') | svgIcon }}" />
                    {{ kiosk.locked ? store.i18n.kiosk_unlock() : store.i18n.kiosk_lock() }}
                  </ion-button>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      <ion-card>
        <ion-card-header>
          <ion-card-title>Fahrten heute ({{ store.todaysTrips().length }})</ion-card-title>
          <ion-card-subtitle>{{ today | prettyDate }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          @if (store.todaysTrips().length === 0) {
            <okr-empty-list [message]="store.i18n.kiosk_no_trips()" />
          } @else {
            <ion-list lines="inset">
              @for (trip of store.todaysTrips(); track trip.okey) {
                <ion-item>
                  <ion-label>
                    {{ formatTime(trip.startTime) }} · {{ trip.resource?.name2 }}
                    <p>{{ trip.name }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ trip.state }}</ion-label>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocKiosk {
  protected readonly store = inject(AocKioskStore);
  protected readonly formatTime = formatTripTime;
  protected readonly today = getTodayStr();

  protected online(kiosk: KioskStatus): boolean {
    return isKioskOnline(kiosk.seen, this.store.now());
  }

  protected seenAge(kiosk: KioskStatus): string {
    return formatSeenAge(kiosk.seen, this.store.now());
  }

  protected battery(kiosk: KioskStatus): string {
    return formatBattery(kiosk.batteryLevel);
  }
}
