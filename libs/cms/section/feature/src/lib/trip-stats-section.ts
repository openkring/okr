import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAvatar, IonCard, IonCardContent, IonCol, IonGrid, IonImg, IonRow } from '@ionic/angular/standalone';

import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([LineChart, GridComponent, CanvasRenderer, LegendComponent, TooltipComponent]);

import { TripStatsSection } from '@okr/shared-models';
import { EmptyList, ListFilter, OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { TranslatePipe } from '@okr/shared-i18n';
import { getCategoryIcon, getItemLabel } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';

import { StatsRow, StatsSortField, TripStatsSectionStore } from './trip-stats-section.store';

@Component({
  selector: 'okr-trip-stats-section',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, AvatarPipe,
    Spinner, EmptyList, OptionalCardHeader, ListFilter, NgxEchartsDirective,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonAvatar, IonImg,
  ],
  providers: [
    TripStatsSectionStore,
    provideEchartsCore({ echarts }),
  ],
  styles: [`
    /* rows read like the ion-items of every other list modal: same height, same inset divider */
    .header-row {
      font-weight: 600;
      border-bottom: 1px solid var(--ion-color-step-150, #d7d8da);
      padding-inline: 16px;
    }
    .item-row {
      min-height: 48px;
      align-items: center;
      padding-inline: 16px;
      border-bottom: 1px solid var(--ion-color-step-100, #e5e5e5);
    }
    .item-row:last-of-type { border-bottom: 0; }

    .name { display: flex; align-items: center; gap: 12px; }
    ion-avatar { width: 30px; height: 30px; flex: none; }

    .clickable   { cursor: pointer; user-select: none; }
    .num         { text-align: right; }
    .chart       { height: 300px; }
    ion-card         { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
  `],
  template: `
    @if(store.isLoading()) {
      <okr-spinner />
    } @else {
      <!-- compact: keeps search and year at 6 cols each on every breakpoint -->
      <okr-list-filter
        [compact]="true"
        [years]="store.viewType() === 'list' ? availableYears : undefined"
        [selectedYear]="store.selectedYear()"
        (yearChanged)="store.setYear($event)"
        (searchTermChanged)="store.setSearchTerm($event)"
      />
      @if(store.listRows().length === 0 && store.viewType() === 'list') {
        <okr-empty-list [message]="store.i18n.tripstats_empty()" />
      } @else {
        @switch(store.viewType()) {
          @case('list') {
            <ion-card>
              <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
              <ion-card-content>
                <ion-grid class="ion-no-padding">
                  <ion-row class="header-row">
                    <ion-col class="clickable" (click)="store.setSort('name')">
                      {{ store.i18n.tripstats_col_name() }}{{ sortIcon('name') }}
                    </ion-col>
                    @if(showTypeColumn()) {
                      <ion-col size="3" class="ion-hide-sm-down clickable" (click)="store.setSort('type')">
                        {{ store.i18n.tripstats_col_type() }}{{ sortIcon('type') }}
                      </ion-col>
                    }
                    <ion-col size="3" size-md="2" class="num clickable" (click)="store.setSort('km')">
                      {{ store.i18n.tripstats_col_km() }}{{ sortIcon('km') }}
                    </ion-col>
                    <ion-col size="3" size-md="2" class="num clickable" (click)="store.setSort('trips')">
                      {{ store.i18n.tripstats_col_trips() }}{{ sortIcon('trips') }}
                    </ion-col>
                  </ion-row>
                  @for(row of store.listRows(); track row.key) {
                    <ion-row class="item-row clickable" (click)="store.showDetail(row, fallbackIcon(row) ?? '')">
                      <ion-col class="name">
                        <ion-avatar>
                          <ion-img src="{{ row.avatarKey | avatar:fallbackIcon(row) }}" alt="Avatar" />
                        </ion-avatar>
                        <span>{{ row.name }}</span>
                      </ion-col>
                      @if(showTypeColumn()) {
                        <ion-col size="3" class="ion-hide-sm-down">{{ typeLabel(row.subType) | translate | async }}</ion-col>
                      }
                      <ion-col size="3" size-md="2" class="num">{{ row.km }}</ion-col>
                      <ion-col size="3" size-md="2" class="num">{{ row.trips }}</ion-col>
                    </ion-row>
                  }
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
          @case('graph') {
            @if(store.echartsOption(); as opt) {
              <ion-card>
                <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
                <ion-card-content>
                  <div echarts [options]="opt" class="chart"></div>
                </ion-card-content>
              </ion-card>
            } @else {
              <okr-empty-list [message]="store.i18n.tripstats_empty()" />
            }
          }
        }
      }
    }
  `,
})
export class TripStatsSectionComponent {
  protected readonly store = inject(TripStatsSectionStore);

  // inputs
  public section  = input<TripStatsSection>();
  public editMode = input<boolean>(false);

  // derived
  protected readonly title    = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  /**
   * The rboat-type column only says something for boats — a person has no boat type.
   * Read from the store, not from the section input, so a section without an explicit
   * contentType follows the store's 'boat' default instead of losing the column.
   */
  protected readonly showTypeColumn = computed(() => this.store.contentType() === 'boat');

  protected readonly availableYears = Array.from(
    { length: 10 },
    (_, i) => new Date().getFullYear() - i,
  );

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }

  /**
   * Placeholder shown when a boat has no uploaded avatar. The generic 'resource' icon the
   * avatar pipe falls back to is wrong for a boat — the boat's icon lives on its `rboat_type`
   * category item, keyed by the resource's subType.
   */
  protected fallbackIcon(row: StatsRow): string | undefined {
    return getCategoryIcon(this.store.rboatTypes(), row.subType) || undefined;
  }

  /** i18n key of an rboat_type item — data-driven, so it goes through TranslatePipe, not the store. */
  protected typeLabel(subType: string): string {
    const category = this.store.rboatTypes();
    return category ? getItemLabel(category, subType) : subType;
  }

  protected sortIcon(field: StatsSortField): string {
    if (this.store.sortField() !== field) return '';
    return this.store.sortAsc() ? ' ↑' : ' ↓';
  }
}
