import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { IonCard, IonCardContent } from '@ionic/angular';

import { ConnectionsSection, LocationModel } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { LocationService } from '@okr/location-data-access';
import { TRANSIT_I18N_KEYS } from '@okr/mobility-transit-util';

import { TransitConnections } from './transit-connections';

/** A location key as stored: a bare okey, or `name@okey` like `calevent.locationKey`. */
function okeyOf(key: string): string {
  return (key ?? '').split('@').pop()?.trim() ?? '';
}

/**
 * CMS section `connections` (spec 1.131 §4.1): «So erreichst du uns». Resolves the configured destination (empty ⇒
 * the page's location) and the optional source (empty ⇒ the viewer's current position) and renders the generic
 * connections view, departing now.
 */
@Component({
  selector: 'okr-connections-section',
  standalone: true,
  imports: [TransitConnections, OptionalCardHeader, Spinner, IonCard, IonCardContent],
  styles: [`
    ion-card { margin: 0; padding: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 12px 16px 16px; }
  `],
  template: `
    @if (section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="section.title || i18n.title()" [subTitle]="section.subTitle" />
        <ion-card-content>
          @if (destination(); as destination) {
            <okr-transit-connections [destination]="destination" [source]="source()" anchor="departAt" />
          } @else if (destination() === null) {
            <p>{{ i18n.no_coordinates() }}</p>
          } @else {
            <okr-spinner />
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class ConnectionsSectionComponent {
  private readonly locationService = inject(LocationService);
  protected readonly i18n = inject(I18nService).translateAll(TRANSIT_I18N_KEYS);

  public readonly section = input<ConnectionsSection>();
  /** The page's location. Used whenever the section does not name a destination of its own. */
  public readonly pageLocationKey = input('');

  private readonly destinationKey = computed(() => okeyOf(this.section()?.properties?.destinationKey || this.pageLocationKey()));
  private readonly sourceKey = computed(() => okeyOf(this.section()?.properties?.sourceKey ?? ''));

  /** undefined while loading, null when there is no (readable) destination */
  protected readonly destination = toSignal(
    toObservable(this.destinationKey).pipe(
      switchMap((key) => (key ? this.locationService.read(key).pipe(map((l) => l ?? null)) : of(null))),
    ),
  );

  protected readonly source = toSignal(
    toObservable(this.sourceKey).pipe(switchMap((key) => (key ? this.locationService.read(key) : of(undefined)))),
    { initialValue: undefined as LocationModel | undefined },
  );
}
