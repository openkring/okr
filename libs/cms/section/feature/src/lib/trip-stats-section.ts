import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([LineChart, GridComponent, CanvasRenderer, LegendComponent, TooltipComponent]);

import { TripStatsSection } from '@bk2/shared-models';
import { EmptyList, ListFilter, OptionalCardHeader, Spinner } from '@bk2/shared-ui';

import { TripStatsSectionStore } from './trip-stats-section.store';

@Component({
  selector: 'bk-trip-stats-section',
  standalone: true,
  imports: [
    Spinner, EmptyList, OptionalCardHeader, ListFilter, NgxEchartsDirective,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  providers: [
    TripStatsSectionStore,
    provideEchartsCore({ echarts }),
  ],
  styles: [`
    .header-row { font-weight: 600; }
    .clickable   { cursor: pointer; user-select: none; }
    .num         { text-align: right; }
    .chart       { height: 300px; }
    ion-card         { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
  `],
  template: `
    @if(store.isLoading()) {
      <bk-spinner />
    } @else {
      <bk-list-filter
        [years]="store.viewType() === 'list' ? availableYears : undefined"
        [selectedYear]="store.selectedYear()"
        (yearChanged)="store.setYear($event)"
        (searchTermChanged)="store.setSearchTerm($event)"
      />
      @if(store.listRows().length === 0 && store.viewType() === 'list') {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        @switch(store.viewType()) {
          @case('list') {
            <ion-card>
              <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
              <ion-card-content>
                <ion-grid>
                  <ion-row class="header-row">
                    <ion-col>{{ store.i18n.colName() }}</ion-col>
                    <ion-col class="num clickable" (click)="store.setSort('km')">
                      {{ store.i18n.colKm() }}{{ sortIcon('km') }}
                    </ion-col>
                    <ion-col class="num clickable" (click)="store.setSort('trips')">
                      {{ store.i18n.colTrips() }}{{ sortIcon('trips') }}
                    </ion-col>
                  </ion-row>
                  @for(row of store.listRows(); track row.key) {
                    <ion-row>
                      <ion-col>{{ row.name }}</ion-col>
                      <ion-col class="num">{{ row.km }}</ion-col>
                      <ion-col class="num">{{ row.trips }}</ion-col>
                    </ion-row>
                  }
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
          @case('graph') {
            @if(store.echartsOption(); as opt) {
              <ion-card>
                <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
                <ion-card-content>
                  <div echarts [options]="opt" class="chart"></div>
                </ion-card-content>
              </ion-card>
            } @else {
              <bk-empty-list [message]="store.i18n.empty()" />
            }
          }
        }
      }
    }
  `,
})
export class TripStatsSectionComponent {
  protected readonly store = inject(TripStatsSectionStore);

  public section  = input<TripStatsSection>();
  public editMode = input<boolean>(false);

  protected readonly title    = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  protected readonly availableYears = Array.from(
    { length: 10 },
    (_, i) => new Date().getFullYear() - i,
  );

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }

  protected sortIcon(field: 'km' | 'trips'): string {
    if (this.store.sortField() !== field) return '';
    return this.store.sortAsc() ? ' ↑' : ' ↓';
  }
}
