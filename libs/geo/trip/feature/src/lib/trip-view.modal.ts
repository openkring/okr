import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TripModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { getWeekdayI18nKey } from '@okr/shared-util-core';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { AvatarDisplay } from '@okr/avatar-ui';

import { formatTripTime, TRIP_I18N_KEYS, TripI18n } from '@okr/trip-util';

/** Read-only trip representation for registered users — the counterpart of okr-calevent-view-modal. */
@Component({
  selector: 'okr-trip-view-modal',
  standalone: true,
  imports: [
    AsyncPipe, PrettyDatePipe, SvgIconPipe, TranslatePipe,
    Header, AvatarDisplay,
    IonContent, IonCard, IonCardContent, IonItem, IonLabel, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.9rem; color: var(--ion-color-medium); margin-bottom: 2px; }
    .view-value { font-size: 1rem; margin-bottom: 8px; }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .participant-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 4px 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: trip().name }" [isModal]="true" />

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-content>

          <ion-item lines="none">
            <ion-icon slot="start" src="{{'calendar' | svgIcon}}" />
            <ion-label>
              <p class="view-label">{{ i18n.date() }}</p>
              <p class="view-value">{{ weekdayKey() | translate | async }}, {{ trip().startDate | prettyDate }}{{ timeRange() }}</p>
            </ion-label>
          </ion-item>

          @if(trip().resource?.name2) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'boat' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ i18n.boat() }}</p>
                <p class="view-value">{{ trip().resource?.name2 }}</p>
              </ion-label>
            </ion-item>
          }

          @if(trip().participants.length) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'people' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ i18n.participants() }}</p>
                <div class="participant-row">
                  @for(participant of participants(); track $index) {
                    <okr-avatar-display [avatars]="participant" [showName]="true" />
                  }
                </div>
              </ion-label>
            </ion-item>
          }

          @if(locationLabel()) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'location' | svgIcon}}" />
              <ion-label class="ion-text-wrap">
                <p class="view-label">{{ i18n.location() }}</p>
                <p class="view-value">{{ locationLabel() }}</p>
              </ion-label>
            </ion-item>
          }

          <ion-item lines="none">
            <ion-icon slot="start" src="{{'target' | svgIcon}}" />
            <ion-label>
              <p class="view-label">{{ i18n.distance_label() }}</p>
              <p class="view-value">{{ trip().distance }} km</p>
            </ion-label>
          </ion-item>

          @if(trip().notes) {
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'notes' | svgIcon}}" />
              <ion-label class="ion-text-wrap">
                <p class="view-label">{{ i18n.notes_label() }}</p>
                <p class="view-value">{{ trip().notes }}</p>
              </ion-label>
            </ion-item>
          }

        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class TripViewModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;

  public trip = input.required<TripModel>();

  protected readonly weekdayKey = computed(() => getWeekdayI18nKey(this.trip().startDate, false));
  /** one single-element array per person, so each avatar is rendered with its name on its own line */
  protected readonly participants = computed(() => this.trip().participants.map(p => [p]));
  protected readonly locationLabel = computed(() => {
    const t = this.trip();
    return t.locations.map(l => l.name2 || l.name1).filter(Boolean).join(' – ') || t.customLocationLabel;
  });
  protected readonly timeRange = computed(() => {
    const t = this.trip();
    const start = formatTripTime(t.startTime);
    if (!start) return '';
    const end = formatTripTime(t.endTime);
    return end ? `, ${start} - ${end}` : `, ${start}`;
  });
}
