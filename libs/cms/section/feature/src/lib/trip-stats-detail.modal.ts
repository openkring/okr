import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonContent, IonItem, IonLabel, IonList, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { TripModel } from '@okr/shared-models';
import { PrettyDatePipe } from '@okr/shared-pipes';
import { EmptyList, Header, YearSelect } from '@okr/shared-ui';
import { getYear, getYearList } from '@okr/shared-util-core';
import { yearMatches } from '@okr/shared-categories';

import { AvatarToolbar } from '@okr/avatar-feature';
import { TripService } from '@okr/trip-data-access';

import { SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { StatsRow } from './trip-stats-section.store';

/**
 * Drill-down of one trip-stats row: every trip the person took part in, or every trip done with
 * the boat, for the selected year. Newest first — TripService.list() already orders by startDate desc.
 */
@Component({
  selector: 'okr-trip-stats-detail-modal',
  standalone: true,
  imports: [
    PrettyDatePipe,
    Header, AvatarToolbar, YearSelect, EmptyList,
    IonContent, IonToolbar, IonList, IonItem, IonLabel,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.tripstats_title() }" [isModal]="true" />
    <okr-avatar-toolbar
      [key]="row().avatarKey"
      [modelType]="isBoat() ? 'resource' : 'person'"
      [defaultIcon]="defaultIcon()"
      [readOnly]="true"
      [title]="row().name"
    />
    <ion-toolbar color="light">
      <okr-year-select [(selectedYear)]="year" [years]="years" [readOnly]="false" />
    </ion-toolbar>
    <ion-content>
      @if(trips().length === 0) {
        <okr-empty-list [message]="i18n.tripstats_detail_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(trip of trips(); track trip.okey) {
            <ion-item>
              <ion-label>
                <h3>{{ trip.startDate | prettyDate }}</h3>
                <p>{{ subLabel(trip) }}</p>
              </ion-label>
              <ion-label slot="end">{{ trip.distance }} km</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class TripStatsDetailModal {
  protected readonly i18n = inject(I18nService).translateAll(SECTION_I18N_KEYS);

  // inputs (set by the modal controller via componentProps)
  public readonly row = input.required<StatsRow>();
  public readonly contentType = input.required<'boat' | 'member'>();
  /** Icon shown in the toolbar when the subject has no avatar (a boat's rboat-type icon). */
  public readonly defaultIcon = input<string>('');

  // signals
  protected readonly year = signal(getYear());

  // derived
  protected readonly years = getYearList(getYear(), 5);
  protected readonly isBoat = computed(() => this.contentType() === 'boat');

  private readonly allTrips = toSignal(inject(TripService).list(), { initialValue: [] as TripModel[] });

  protected readonly trips = computed(() => {
    const key = this.row().key;
    const isBoat = this.isBoat();
    return this.allTrips().filter(trip =>
      trip.state !== 'deleted' &&
      yearMatches(trip.startDate, this.year()) &&
      (isBoat
        ? trip.resource?.key === key
        : trip.participants.some(p => p.key === key))
    );
  });

  /** The boat for a person's trip, the crew for a boat's trip — whatever the row is not. */
  protected subLabel(trip: TripModel): string {
    return this.isBoat()
      ? trip.participants.map(p => `${p.name1} ${p.name2}`.trim()).join(', ')
      : (trip.resource?.name2 ?? '');
  }
}
