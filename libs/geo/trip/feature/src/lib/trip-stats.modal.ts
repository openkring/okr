import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { TripStatsSection } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';

import { TripStatsSectionComponent } from '@bk2/cms-section-feature';
import { TRIP_I18N_KEYS, TripI18n } from '@bk2/trip-util';

/**
 * Hosts the existing CMS trip-stats section in a modal, preset to either boats or members.
 * A segment toggle switches the embedded section between the per-year ranking table ('list')
 * and the multi-year history graph ('graph'). All data comes from TripStatsService via the section store.
 */
@Component({
  selector: 'bk-trip-stats-modal',
  standalone: true,
  imports: [
    Header, TripStatsSectionComponent,
    IonContent, IonSegment, IonSegmentButton, IonLabel,
  ],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <ion-segment [value]="viewType()" (ionChange)="onViewChange($event)">
        <ion-segment-button value="list">
          <ion-label>{{ i18n.stats_view_list() }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="graph">
          <ion-label>{{ i18n.stats_view_graph() }}</ion-label>
        </ion-segment-button>
      </ion-segment>
      <bk-trip-stats-section [section]="section()" />
    </ion-content>
  `,
})
export class TripStatsModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;

  // inputs
  public readonly contentType = input.required<'boat' | 'member'>();

  // signals
  protected readonly viewType = signal<'list' | 'graph'>('list');

  // derived
  protected readonly title = computed(() =>
    this.contentType() === 'boat' ? this.i18n.stats_boat_title() : this.i18n.stats_member_title()
  );

  // The embedded section reads only title/subTitle/properties; the modal header already shows
  // the title, so we leave the card title empty to avoid a duplicate heading.
  protected readonly section = computed(() => ({
    title: '',
    subTitle: '',
    type: 'trip-stats',
    properties: { viewType: this.viewType(), contentType: this.contentType() },
  } as TripStatsSection));

  protected onViewChange(event: CustomEvent): void {
    this.viewType.set(event.detail.value as 'list' | 'graph');
  }
}
