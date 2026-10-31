import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { LocationService } from '@okr/location-data-access';
import { DEPARTURES_I18N_KEYS } from '@okr/mobility-transit-util';
import { TransitDepartures } from '@okr/mobility-transit-feature';

/** Where «Zurück» leads: the Logbuch as the kiosk shows it (`KIOSK_URL` of the kiosk lock). */
const LOGBUCH_URL = '/trips/logbuch/c-trips';

/**
 * The departure board of the club's own place, for the boathouse kiosk (spec 1.130 §9, kiosk follow-up). Lives under
 * `/trips` because the kiosk lock lets a kiosk-only user reach nothing else; opened from the Logbuch toolbar.
 *
 * The place is the tenant's `appConfig.ownerLocationId` (for scs: «Seeclub Stäfa»), so the board needs no
 * configuration of its own. Large type, to be read from a step away. Kiosker's idle reload brings the iPad back to
 * the Logbuch after five minutes, so the page needs no timer of its own for that.
 */
@Component({
  selector: 'okr-trip-departures',
  standalone: true,
  imports: [TransitDepartures, Spinner, SvgIconPipe, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent],
  styles: [`
    .kiosk-toolbar { --min-height: 84px; }
    .content { max-width: 1100px; margin: 0 auto; padding: 16px 24px; }
    .note { color: var(--ion-color-medium); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary" class="kiosk-toolbar">
        <ion-buttons slot="start">
          <ion-button (click)="back()">
            <ion-icon slot="start" src="{{ 'chevron-back' | svgIcon }}" />
            {{ i18n.back() }}
          </ion-button>
        </ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="content">
        @if (location(); as location) {
          <okr-transit-departures [location]="location" [limit]="12" size="large" />
        } @else if (location() === null) {
          <p class="note">{{ i18n.no_coordinates() }}</p>
        } @else {
          <okr-spinner />
        }
      </div>
    </ion-content>
  `,
})
export class TripDepartures {
  private readonly appStore = inject(AppStore);
  private readonly locationService = inject(LocationService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll(DEPARTURES_I18N_KEYS);

  private readonly locationKey = computed(() => this.appStore.appConfig().ownerLocationId ?? '');

  /** undefined while loading, null when the tenant has no (readable) own location */
  protected readonly location = toSignal(
    toObservable(this.locationKey).pipe(
      switchMap((key) => (key ? this.locationService.read(key).pipe(map((l) => l ?? null)) : of(null))),
    ),
  );

  protected back(): void {
    void this.router.navigateByUrl(LOGBUCH_URL);
  }
}
