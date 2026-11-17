import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { IonCard, IonCardContent, IonIcon, IonItem, IonLabel } from '@ionic/angular';

import { ConnectionsSection, LocationModel } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { LocationService } from '@okr/location-data-access';
import { TRANSIT_I18N_KEYS, timetableConfigOf } from '@okr/mobility-transit-util';

import { TransitConnections } from './transit-connections';

/** A location key as stored: a bare okey, or `name@okey` like `calevent.locationKey`. */
function okeyOf(key: string): string {
  return (key ?? '').split('@').pop()?.trim() ?? '';
}

/**
 * CMS section `connections` (spec 1.162 §5.6): the «Fahrplan». Resolves the configured Nach (empty ⇒ the page's
 * location, else the viewer picks it) and the optional Von (empty ⇒ the viewer's current position) and renders the
 * timetable behind `@defer (on interaction)`, so a page view costs no API call, no position prompt and no address
 * read: the timetable reads the picker's favourites (incl. the viewer's home address) only when the picker opens.
 */
@Component({
  selector: 'okr-connections-section',
  standalone: true,
  imports: [TransitConnections, OptionalCardHeader, Spinner, SvgIconPipe, IonCard, IonCardContent, IonItem, IonIcon, IonLabel],
  styles: [`
    ion-card { margin: 0; padding: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 12px 16px 16px; }
  `],
  template: `
    @if (section(); as section) {
      <ion-card>
        <okr-optional-card-header [intro]="section.intro" [introPosition]="section.introPosition" [title]="section.title || i18n.title()" [subTitle]="section.subTitle" />
        <ion-card-content>
          @if (destination() !== undefined) {
            @defer (on interaction) {
              <okr-transit-connections [destination]="destination() ?? undefined" [source]="source()" [anchor]="cfg().anchor"
                [favoritesConfig]="cfg()" [allowAddToCalendar]="cfg().allowAddToCalendar" />
            } @placeholder {
              <ion-item lines="none" button="true" [detail]="true">
                <ion-icon slot="start" src="{{ 'map' | svgIcon }}" />
                <ion-label>{{ i18n.search() }}</ion-label>
              </ion-item>
            }
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

  protected readonly cfg = computed(() => timetableConfigOf(this.section()?.properties));

  private readonly destinationKey = computed(() => okeyOf(this.cfg().destinationKey || this.pageLocationKey()));
  private readonly sourceKey = computed(() => okeyOf(this.cfg().sourceKey));

  /** undefined while loading, null when there is no (readable) destination: the viewer then picks Nach */
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
