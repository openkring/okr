import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { IonCard, IonCardContent } from '@ionic/angular';

import { DeparturesSection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { LocationService } from '@okr/location-data-access';
import { DEPARTURES_I18N_KEYS } from '@okr/mobility-transit-util';

import { TransitDepartures } from './transit-departures';

/** A location key as stored: a bare okey, or `name@okey` like `calevent.locationKey`. */
function okeyOf(key: string): string {
  return (key ?? '').split('@').pop()?.trim() ?? '';
}

/**
 * CMS section `departures` (spec 1.130 §6.4): the next departures at the stop next to the configured place
 * (empty ⇒ the page's location), with the disruption messages that concern them.
 */
@Component({
  selector: 'okr-departures-section',
  standalone: true,
  imports: [TransitDepartures, OptionalCardHeader, Spinner, IonCard, IonCardContent],
  styles: [`
    ion-card { margin: 0; padding: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 12px 16px 16px; }
  `],
  template: `
    @if (section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="section.title || i18n.title()" [subTitle]="section.subTitle" />
        <ion-card-content>
          @if (location(); as location) {
            <okr-transit-departures
              [location]="location"
              [stopRef]="section.properties.stopRef ?? ''"
              [stopName]="section.properties.stopName ?? ''"
              [limit]="section.properties.limit || 8"
              [walkMinutes]="section.properties.walkMinutes"
            />
          } @else if (location() === null) {
            <p>{{ i18n.no_coordinates() }}</p>
          } @else {
            <okr-spinner />
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class DeparturesSectionComponent {
  private readonly locationService = inject(LocationService);
  protected readonly i18n = inject(I18nService).translateAll(DEPARTURES_I18N_KEYS);

  public readonly section = input<DeparturesSection>();
  /** The page's location. Used whenever the section does not name a place of its own. */
  public readonly pageLocationKey = input('');

  private readonly locationKey = computed(() => okeyOf(this.section()?.properties?.locationKey || this.pageLocationKey()));

  /** undefined while loading, null when there is no (readable) location */
  protected readonly location = toSignal(
    toObservable(this.locationKey).pipe(
      switchMap((key) => (key ? this.locationService.read(key).pipe(map((l) => l ?? null)) : of(null))),
    ),
  );
}
