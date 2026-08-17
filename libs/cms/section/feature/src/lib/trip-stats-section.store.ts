import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import type { EChartsOption } from 'echarts';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PersonModel, ResourceModel, TripStatsConfig } from '@okr/shared-models';

import { StatsRollup, TripStatsService } from '@okr/trip-data-access';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

export interface StatsRow {
  key: string;
  name: string;
  km: number;
  trips: number;
  /** '<modelType>.<okey>' — what the avatar pipe resolves. */
  avatarKey: string;
  /** Boats only: the raw `rboat_type` item name; the component turns it into a label. */
  subType: string;
}

export type StatsSortField = 'name' | 'type' | 'km' | 'trips';

/** Text columns read best A→Z, number columns biggest-first. */
const SORTS_ASCENDING_BY_DEFAULT: ReadonlySet<StatsSortField> = new Set<StatsSortField>(['name', 'type']);

type TripStatsSectionState = {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
  selectedYear: number;
  sortField: StatsSortField;
  sortAsc: boolean;
  searchTerm: string;
};

const initialState: TripStatsSectionState = {
  viewType: 'list',
  contentType: 'boat',
  selectedYear: new Date().getFullYear(),
  sortField: 'km',
  sortAsc: false,
  searchTerm: '',
};

export const TripStatsSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore:         inject(AppStore),
    tripStatsService: inject(TripStatsService),
    i18nService:      inject(I18nService),
    modalController:  inject(ModalController),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(SECTION_I18N_KEYS),
  })),
  withComputed(store => ({
    /** Boat-type category, used by the list to label the rboat-type column. */
    rboatTypes: computed(() => store.appStore.tryGetCategory('rboat_type')),
  })),
  withProps(store => ({
    // One document holds the whole ranking for the selected year — active when viewType === 'list'
    listResource: rxResource({
      params: () => ({
        viewType:     store.viewType(),
        entityType:   store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
        selectedYear: store.selectedYear(),
      }),
      stream: ({ params }) => params.viewType !== 'list'
        ? of(undefined)
        : store.tripStatsService.getRollup(params.entityType, params.selectedYear),
    }),
    // One query over all years' rollups — active when viewType === 'graph'
    graphResource: rxResource({
      params: () => ({
        viewType:   store.viewType(),
        entityType: store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
      }),
      stream: ({ params }) => params.viewType !== 'graph'
        ? of([] as StatsRollup[])
        : store.tripStatsService.getRollupHistory(params.entityType),
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.listResource.isLoading() || store.graphResource.isLoading()),

    listRows: computed((): StatsRow[] => {
      const entries     = store.listResource.value()?.entries ?? {};
      const term        = store.searchTerm().toLowerCase();
      const contentType = store.contentType();
      const sortField   = store.sortField();
      const sortAsc     = store.sortAsc();

      return Object.entries(entries)
        .map(([key, stats]) => {
          let name: string;
          let subType = '';
          if (contentType === 'boat') {
            const boat = store.appStore.allResources().find((r: ResourceModel) => r.okey === key);
            name = boat?.name ?? key;
            subType = boat?.subType ?? '';
          } else {
            const p = store.appStore.allPersons().find((p: PersonModel) => p.okey === key);
            name = p ? `${p.firstName} ${p.lastName}`.trim() : key;
          }
          const modelType = contentType === 'boat' ? 'resource' : 'person';
          return {
            key,
            name,
            subType,
            avatarKey: `${modelType}.${key}`,
            km: stats?.km ?? 0,
            trips: stats?.count ?? 0,
          };
        })
        .filter(r => r.km > 0 && (!term || r.name.toLowerCase().includes(term)))
        // `diff` is always the descending comparator; sortAsc flips it, for text and numbers alike
        .sort((a, b) => {
          let diff: number;
          switch (sortField) {
            case 'name':  diff = b.name.localeCompare(a.name); break;
            case 'type':  diff = b.subType.localeCompare(a.subType); break;
            case 'trips': diff = b.trips - a.trips; break;
            default:      diff = b.km - a.km;
          }
          return sortAsc ? -diff : diff;
        });
    }),

    echartsOption: computed((): EChartsOption | null => {
      const raw = store.graphResource.value() ?? [];
      if (!raw.length) return null;

      // Each rollup doc is one year ('<entityType>_<year>'); its entries sum to that year's club total.
      const yearMap = new Map<string, number>();
      for (const rollup of raw) {
        const year = rollup.okey?.split('_')[1];
        if (!year) continue;
        const total = Object.values(rollup.entries ?? {}).reduce((sum, e) => sum + (e.km ?? 0), 0);
        yearMap.set(year, total);
      }
      const years = [...yearMap.keys()].sort();
      if (!years.length) return null;

      return {
        xAxis: { type: 'category', data: years },
        yAxis: { type: 'value', name: 'km' },
        tooltip: { trigger: 'axis' },
        series: [{
          name: 'Total km',
          type: 'line',
          smooth: true,
          data: years.map(y => yearMap.get(y) ?? 0),
        }],
      };
    }),
  })),
  withMethods(store => ({
    setConfig(config: TripStatsConfig | undefined): void {
      if (!config) return;
      patchState(store, {
        viewType:    config.viewType    ?? 'list',
        contentType: config.contentType ?? 'boat',
      });
    },

    /** Drill down into one row: all trips of that person/boat, per year. */
    async showDetail(row: StatsRow, defaultIcon: string): Promise<void> {
      const { TripStatsDetailModal } = await import('./trip-stats-detail.modal');
      const modal = await store.modalController.create({
        component: TripStatsDetailModal,
        cssClass: 'wide-modal',
        componentProps: { row, contentType: store.contentType(), defaultIcon },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    setYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSort(field: StatsSortField): void {
      patchState(store, {
        sortAsc:   store.sortField() === field
          ? !store.sortAsc()
          : SORTS_ASCENDING_BY_DEFAULT.has(field),
        sortField: field,
      });
    },
  }))
);
