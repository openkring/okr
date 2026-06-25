import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of } from 'rxjs';
import type { EChartsOption } from 'echarts';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PersonModel, ResourceModel, TripStatsConfig } from '@bk2/shared-models';

import { TripStatsService, YearStats } from '@bk2/trip-data-access';
import { SECTION_I18N_KEYS } from '@bk2/cms-section-util';

export interface StatsRow {
  key: string;
  name: string;
  km: number;
  trips: number;
}

type TripStatsSectionState = {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
  selectedYear: number;
  sortField: 'km' | 'trips';
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
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(SECTION_I18N_KEYS),
  })),
  withComputed(store => ({
    entityKeys: computed(() => {
      if (store.contentType() === 'boat') {
        return store.appStore.allResources()
          .filter((r: ResourceModel) => r.type === 'rboat')
          .map((r: ResourceModel) => r.bkey)
          .filter((k): k is string => !!k);
      }
      return store.appStore.allPersons()
        .map((p: PersonModel) => p.bkey)
        .filter((k): k is string => !!k);
    }),
  })),
  withProps(store => ({
    // Loads only the selected year — active when viewType === 'list'
    listResource: rxResource({
      params: () => ({
        viewType:     store.viewType(),
        entityType:   store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
        keys:         store.entityKeys(),
        selectedYear: store.selectedYear(),
      }),
      stream: ({ params }) => {
        if (params.viewType !== 'list' || !params.keys.length) return of([] as Array<{ key: string; stats: YearStats | undefined }>);
        return combineLatest(
          params.keys.map(key =>
            store.tripStatsService.getStats(params.entityType, key, params.selectedYear).pipe(
              map(stats => ({ key, stats }))
            )
          )
        );
      },
    }),
    // Loads full history — active when viewType === 'graph'
    graphResource: rxResource({
      params: () => ({
        viewType:   store.viewType(),
        entityType: store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
        keys:       store.entityKeys(),
      }),
      stream: ({ params }) => {
        if (params.viewType !== 'graph' || !params.keys.length) return of([] as Array<{ key: string; history: YearStats[] }>);
        return combineLatest(
          params.keys.map(key =>
            store.tripStatsService.getHistory(params.entityType, key).pipe(
              map(history => ({ key, history }))
            )
          )
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.listResource.isLoading() || store.graphResource.isLoading()),

    listRows: computed((): StatsRow[] => {
      const raw         = store.listResource.value() ?? [];
      const term        = store.searchTerm().toLowerCase();
      const contentType = store.contentType();
      const sortField   = store.sortField();
      const sortAsc     = store.sortAsc();

      return raw
        .map(({ key, stats }: { key: string; stats: YearStats | undefined }) => {
          let name: string;
          if (contentType === 'boat') {
            name = store.appStore.allResources().find((r: ResourceModel) => r.bkey === key)?.name ?? key;
          } else {
            const p = store.appStore.allPersons().find((p: PersonModel) => p.bkey === key);
            name = p ? `${p.firstName} ${p.lastName}`.trim() : key;
          }
          return { key, name, km: stats?.totalKm ?? 0, trips: stats?.tripCount ?? 0 };
        })
        .filter(r => r.km > 0 && (!term || r.name.toLowerCase().includes(term)))
        .sort((a, b) => {
          const diff = sortField === 'km' ? b.km - a.km : b.trips - a.trips;
          return sortAsc ? -diff : diff;
        });
    }),

    echartsOption: computed((): EChartsOption | null => {
      const raw = store.graphResource.value() ?? [];
      if (!raw.length) return null;

      const yearMap = new Map<string, number>();
      for (const { history } of raw as { key: string; history: YearStats[] }[]) {
        for (const h of history) {
          if (!h.bkey) continue;
          yearMap.set(h.bkey, (yearMap.get(h.bkey) ?? 0) + h.totalKm);
        }
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

    setYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSort(field: 'km' | 'trips'): void {
      patchState(store, {
        sortAsc:   store.sortField() === field ? !store.sortAsc() : false,
        sortField: field,
      });
    },
  }))
);
