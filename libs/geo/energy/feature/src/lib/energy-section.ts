import { Component, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular';

import { EnergySection } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { EnergyChart, EnergyCompareTable, EnergyKeyFigures, EnergySources } from '@okr/energy-ui';

import { EnergySectionStore } from './energy-section.store';

/**
 * The energy figures of one municipality, for members. Without figures it says in one line why;
 * with figures it renders every block that has data, and a block without data says so. The charts
 * reach echarts only through the lazy provider in `EnergyChart`, because the dispatcher imports this
 * file statically: never add a value import of echarts here.
 */
@Component({
  selector: 'okr-energy-section',
  imports: [
    EnergyChart, EnergyCompareTable, EnergyKeyFigures, EnergySources,
    OptionalCardHeader, Spinner, IonCard, IonCardContent
  ],
  providers: [EnergySectionStore],
  styles: [`
    ion-card { margin: 0; padding: 0; border: 0; box-shadow: none !important; }
    ion-card-content { color: var(--ion-text-color); }
    h2 { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--ion-text-color); }
    h3 { margin: 1.5rem 0 0.5rem; font-size: 1rem; font-weight: 600; color: var(--ion-text-color); }
    p { margin: 0 0 0.5rem; }
    ul { margin: 0 0 0.5rem; padding-inline-start: 1.25rem; }
    .muted { color: var(--ion-color-step-600); font-size: 0.875rem; }
  `],
  template: `
    <ion-card>
      <okr-optional-card-header [title]="section().title" [subTitle]="section().subTitle" />
      <ion-card-content>
        @if (store.isLoading()) {
          <okr-spinner />
        } @else {
          @switch (store.state()) {
            @case ('noLocation') { <p>{{ store.i18n.state_noLocation() }}</p> }
            @case ('preparing') { <p>{{ store.i18n.state_preparing() }}</p> }
            @case ('noData') { <p>{{ store.i18n.state_noData() }}</p> }
            @case ('ready') {
              @if (store.header(); as header) {
                <h2>{{ header.name }}</h2>
                <p class="muted">{{ header.facts }}</p>
                @if (header.operators) { <p class="muted">{{ header.operators }}</p> }
              }
              @if (store.staleNote()) { <p class="muted">{{ store.staleNote() }}</p> }

              <h3>{{ store.i18n.tiles_title() }}</h3>
              @if (store.tiles().length > 0) {
                <okr-energy-key-figures [tiles]="store.tiles()" />
                <p class="muted">{{ store.i18n.tiles_modelNote() }}</p>
              } @else {
                <p class="muted">{{ store.i18n.state_noBlock() }}</p>
              }

              <h3>{{ store.i18n.trends_title() }}</h3>
              @for (chart of store.trendCharts(); track $index) {
                @if (chart.options; as options) {
                  <okr-energy-chart [title]="chart.title" [options]="options" />
                } @else {
                  <p class="muted">{{ chart.title }}: {{ store.i18n.state_noBlock() }}</p>
                }
              }
              @if (store.hasTrends()) { <p class="muted">{{ store.i18n.trends_gapsNote() }}</p> }

              <h3>{{ store.i18n.tariffs_title() }}</h3>
              @for (chart of store.tariffCharts(); track $index) {
                @if (chart.options; as options) {
                  <okr-energy-chart [title]="chart.title" [options]="options" />
                }
              } @empty {
                <p class="muted">{{ store.i18n.state_noBlock() }}</p>
              }
              @if (store.hasFutureTariff()) { <p class="muted">{{ store.i18n.tariffs_futureNote() }}</p> }

              @if (store.compareRows().length > 0) {
                <h3>{{ store.i18n.compare_title() }}</h3>
                <okr-energy-compare-table
                  [rows]="store.compareRows()"
                  [labels]="store.compareLabels()"
                  [noDataLabel]="store.i18n.compare_noData()" />
                <p class="muted">{{ store.i18n.compare_note() }}</p>
              }

              <h3>{{ store.i18n.gaps_title() }}</h3>
              <p>{{ store.i18n.gaps_intro() }}</p>
              <okr-energy-key-figures [tiles]="store.gapTiles()" />

              <okr-energy-sources [i18n]="store.sourcesI18n()" [solarUrl]="store.solarUrl()" />
            }
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class EnergySectionComponent {
  protected readonly store = inject(EnergySectionStore);

  // inputs
  public section = input.required<EnergySection>();

  constructor() {
    effect(() => this.store.setConfig(this.section().properties));
  }
}
