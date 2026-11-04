import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, catchError, combineLatest, map, of, switchMap } from 'rxjs';

import { EnergyConfig, EnergyFiguresModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { getBfsNr } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { LocationService } from '@okr/location-data-access';
import { EnergyFiguresService } from '@okr/energy-data-access';
import {
  ENERGY_I18N_KEYS, EnergyCompared, compareTarget, energyCompareRows, energyHeader, energySectionState,
  energyStaleNote, energyTariffCharts, energyTiles, energyTrendCharts, hasFutureTariff, solarDocumentUrl,
  uniqueCompareKeys
} from '@okr/energy-util';

type EnergySectionConfig = { locationKey: string; compareKeys: string[] };
const initialState: EnergySectionConfig = { locationKey: '', compareKeys: [] };

/**
 * The energy section of one municipality. Read-only: the documents are written by the nightly job,
 * and both reads are live listeners, so nothing here re-reads. All logic that is worth a test lives
 * in `@okr/energy-util`.
 */
export const EnergySectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    locationService: inject(LocationService),
    figuresService: inject(EnergyFiguresService),
    i18nService: inject(I18nService),
    calendarYear: new Date().getFullYear()
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(ENERGY_I18N_KEYS),
    /** `readModel` does not filter, and one failed read must not take the section down with it. */
    readFigures: (bfsNr: number): Observable<EnergyFiguresModel | undefined> =>
      store.figuresService.read(bfsNr).pipe(
        map((figures) => (figures?.isArchived ? undefined : figures)),
        catchError(() => of(undefined))
      )
  })),
  withProps((store) => ({
    // Gate on currentUser: locations and energy-figures need an authenticated tenant user, and
    // firing before auth is restored would read as «no data».
    locationResource: rxResource({
      params: resourceParams(() => (store.appStore.currentUser() ? store.locationKey() || undefined : undefined)),
      stream: ({ params }) => store.locationService.read(params).pipe(catchError(() => of(undefined)))
    }),
    /** One lookup per location, each with its own catchError: a broken one must not fail the others. */
    compareResource: rxResource({
      params: resourceParams(() =>
        store.appStore.currentUser() ? uniqueCompareKeys(store.locationKey(), store.compareKeys()) : undefined),
      stream: ({ params }): Observable<EnergyCompared[]> => {
        if (params.length === 0) return of([]);
        return combineLatest(params.map((key) =>
          store.locationService.read(key).pipe(
            switchMap((location): Observable<EnergyCompared> => {
              const { name, bfsNr } = compareTarget(location);
              if (bfsNr === undefined) return of({ name, figures: undefined });
              return store.readFigures(bfsNr).pipe(map((figures) => ({ name, figures })));
            }),
            catchError(() => of<EnergyCompared>({ name: undefined, figures: undefined }))
          )
        ));
      }
    })
  })),
  withProps((store) => ({
    figuresResource: rxResource({
      params: resourceParams(() => {
        const location = store.locationResource.value();
        return location ? getBfsNr(location) : undefined;
      }),
      stream: ({ params }) => store.readFigures(params)
    })
  })),

  withComputed((store) => ({
    /** Not settled yet: without this the section would flash «no location» before the first read. */
    isLoading: computed(() =>
      (!!store.locationKey() && !store.appStore.currentUser())
      || store.locationResource.isLoading()
      || store.figuresResource.isLoading()),
    state: computed(() => energySectionState(store.locationResource.value(), store.figuresResource.value())),
    header: computed(() => {
      const figures = store.figuresResource.value();
      return figures ? energyHeader(figures, store.locationResource.value()?.name ?? '', store.i18n) : undefined;
    }),
    staleNote: computed(() => energyStaleNote(store.figuresResource.value()?.sourceDate, new Date(), store.i18n)),
    tiles: computed(() => {
      const figures = store.figuresResource.value();
      return figures ? energyTiles(figures, store.i18n, store.calendarYear, store.i18nService.getActiveLang() || 'de') : [];
    }),
    trendCharts: computed(() => energyTrendCharts(store.figuresResource.value()?.months, store.i18n)),
    hasTrends: computed(() => energyTrendCharts(store.figuresResource.value()?.months, store.i18n).some((chart) => chart.options)),
    tariffCharts: computed(() => energyTariffCharts(store.figuresResource.value()?.tariffs, store.i18n, store.calendarYear)),
    hasFutureTariff: computed(() => hasFutureTariff(store.figuresResource.value()?.tariffs, store.calendarYear)),
    compareRows: computed(() => {
      const figures = store.figuresResource.value();
      if (!figures) return [];
      const name = store.locationResource.value()?.name || figures.municipality;
      return energyCompareRows(name, figures, store.compareResource.value() ?? [], store.i18n.compare_unknownLocation(), store.calendarYear);
    }),
    compareLabels: computed(() => ({
      municipality: store.i18n.compare_municipality(),
      solarPotential: store.i18n.compare_solarPotential(),
      renewableHeating: store.i18n.compare_renewableHeating(),
      electricCars: store.i18n.compare_electricCars(),
      electricityPerPerson: `${store.i18n.compare_electricityPerPerson()} (${store.i18n.tiles_unitMwh()})`,
      tariff: `${store.i18n.compare_tariff()} (${store.i18n.tiles_unitRpKwh()})`
    })),
    sourcesI18n: computed(() => ({
      title: store.i18n.sources_title(),
      energyReporter: store.i18n.sources_energyReporter(),
      energyReporterLink: store.i18n.sources_energyReporterLink(),
      tariffs: store.i18n.sources_tariffs(),
      solar: store.i18n.sources_solar(),
      solarLink: store.i18n.sources_solarLink()
    })),
    solarUrl: computed(() => {
      const bfsNr = store.figuresResource.value()?.bfsNr;
      return bfsNr === undefined ? undefined : solarDocumentUrl(bfsNr);
    })
  })),

  withMethods((store) => ({
    setConfig(config: EnergyConfig | undefined): void {
      patchState(store, { locationKey: config?.locationKey ?? '', compareKeys: config?.compareKeys ?? [] });
    }
  }))
);
