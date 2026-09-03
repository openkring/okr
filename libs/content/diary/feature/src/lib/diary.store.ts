import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Browser } from '@capacitor/browser';
import { firstValueFrom, of, timeout } from 'rxjs';

import type { DiaryLocationPick } from '@okr/content-diary-ui';
import { DiaryService, DiaryWeatherService } from '@okr/content-diary-data-access';
import {
  DIARY_I18N_KEYS, DiaryStateFilter, diaryStateMatches, diaryYearList, driveFolderUrl, getDiaryIndex,
  hasDiaryWeather, newDiary,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import { AvatarInfo, DiaryModel, TripModel } from '@okr/shared-models';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { nameMatches } from '@okr/shared-util-core';

export type DiaryStoreState = {
  searchTerm: string;
  /** undefined = every year (deliberately expensive, see DiaryService.listByYear) */
  selectedYear: number | undefined;
  selectedState: DiaryStateFilter;
};

const initialState: DiaryStoreState = {
  searchTerm: '',
  selectedYear: new Date().getFullYear(),
  selectedState: 'all',
};

/**
 * The year-select sentinel for "all years" is 99 (see YearSelect in @okr/shared-ui); any value
 * below this threshold is treated as "all years" so a plain <1000 comparison stays robust.
 */
const ALL_YEARS = 1000;

export const DiaryStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    diaryService: inject(DiaryService),
    weatherService: inject(DiaryWeatherService),
    locationService: inject(LocationService),
    modelSelectService: inject(ModelSelectService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(DIARY_I18N_KEYS),
    diariesResource: rxResource({
      params: () => ({
        authorKey: store.appStore.fbUser()?.uid ?? '',
        tenantId: store.appStore.tenantId(),
        year: store.selectedYear(),
      }),
      stream: ({ params }) => params.authorKey && params.tenantId
        ? store.diaryService.listByYear(params.authorKey, params.tenantId, params.year)
        : of([] as DiaryModel[]),
    }),
    tripsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }) => params.tenantId ? store.diaryService.listTravelTrips(params.tenantId) : of([] as TripModel[]),
    }),
  })),
  withComputed(store => ({
    authorKey: computed(() => store.appStore.fbUser()?.uid ?? ''),
    tenantId: computed(() => store.appStore.tenantId()),
    currentUser: computed(() => store.appStore.currentUser()),
    isLoading: computed(() => store.diariesResource.isLoading()),
    diaries: computed((): DiaryModel[] => store.diariesResource.value() ?? []),
    travelTrips: computed((): TripModel[] => store.tripsResource.value() ?? []),
    years: computed(() => diaryYearList()),
    // the rule decides, not the role: whoever is signed in writes their own diary
    canWrite: computed(() => !!store.appStore.fbUser()?.uid),
  })),
  withComputed(store => ({
    filteredDiaries: computed(() => store.diaries().filter(diary =>
      diaryStateMatches(diary, store.selectedState())
      && nameMatches(diary.index || getDiaryIndex(diary), store.searchTerm()))),
  })),
  withMethods(store => {
    /**
     * Coordinates of a resolved location, for the weather call; undefined for free text.
     * Bounded by a timeout: if the location stream never emits, the save must still proceed —
     * worst case without weather, which `withWeather` already handles (no-coords toast, status
     * kept unless the author chose 'final').
     */
    const coordinatesOf = async (location: AvatarInfo | undefined): Promise<{ latitude: number; longitude: number } | undefined> => {
      if (!location?.key) return undefined;
      const record = await firstValueFrom(store.locationService.read(location.key).pipe(timeout(5000))).catch(() => undefined);
      return Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
        ? { latitude: record!.latitude, longitude: record!.longitude }
        : undefined;
    };

    /**
     * The spec's one hard weather rule: weather is measured, never guessed, and an entry whose
     * day could not be measured stays a draft. Applied to `day` entries with a resolved place
     * only — an aggregate never has weather, and free text has no coordinate to ask for
     * (the entry keeps the status the author chose; the hint says why there is no weather).
     * An entry that ALREADY has weather is left alone: its measured line is not re-fetched on
     * every edit.
     */
    const withWeather = async (diary: DiaryModel): Promise<DiaryModel> => {
      if (diary.scope !== 'day' || hasDiaryWeather(diary.weather)) return diary;
      const coords = await coordinatesOf(diary.location);
      if (!coords) {
        if (diary.status === 'final') store.alertService.showToast(store.i18n.weather_no_coords());
        return diary;
      }
      const weather = await store.weatherService.fetch({ date: diary.date, ...coords }).catch(() => null);
      if (!weather) {
        store.alertService.showToast(store.i18n.weather_draft_hint());
        return { ...diary, status: 'draft' };
      }
      return { ...diary, weather };
    };

    /** Adapts `ModelSelectService.selectLocation`'s result to the modal's own `DiaryLocationPick`. */
    const pickLocation = async (): Promise<DiaryLocationPick | undefined> => {
      const result = await store.modelSelectService.selectLocation('', false, true);
      if (!result) return undefined;
      if (result.kind === 'predefined') {
        const l = result.location;
        return { location: { key: l.okey, name1: l.name, name2: '', label: l.name, modelType: 'location', type: l.type ?? '', subType: '' } };
      }
      return { customLabel: result.label };
    };

    const openEditor = async (diary: DiaryModel, lockDate: boolean): Promise<DiaryModel | undefined> => {
      const { DiaryEditModal } = await import('@okr/content-diary-ui');
      const modal = await store.modalController.create({
        component: DiaryEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          diary, i18n: store.i18n, currentUser: store.currentUser(), tenantId: store.tenantId(),
          allTags: store.appStore.getTags('diary'), travelTrips: store.travelTrips(), readOnly: false, lockDate,
          // pickers are passed IN as callbacks — the modal must not inject ModelSelectService or
          // the store back (see the dynamic import above; store-modal-dynamic-import memory).
          selectLocation: pickLocation,
          selectPerson: () => store.modelSelectService.selectPersonAvatar(undefined, undefined, false, false),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<DiaryModel>();
      return role === 'confirm' && data ? data : undefined;
    };

    const editEntry = async (diary: DiaryModel): Promise<void> => {
      const edited = await openEditor(diary, true);
      if (!edited) return;
      // the date is the id: changing it is a new document, which this UI does not offer.
      // scope is pinned along with date — the two must agree, and the form itself locks the
      // scope/date controls in edit mode (DiaryForm `lockDate`), so this is a defensive mirror.
      const kept = { ...edited, date: diary.date, scope: diary.scope, okey: diary.okey };
      const ready = await withWeather(kept);
      await store.diaryService.update({ ...ready, index: getDiaryIndex(ready) }, store.currentUser());
      store.diariesResource.reload();
    };

    return {
      setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
      setSelectedYear(year: number) { patchState(store, { selectedYear: year < ALL_YEARS ? undefined : year }); },
      setSelectedState(selectedState: DiaryStateFilter) { patchState(store, { selectedState }); },

      /**
       * A new entry for today. The id is deterministic per date, so "one entry per day" is
       * enforced by reading the id first: if today already has an entry, it is opened for
       * editing instead of being overwritten. An ARCHIVED (soft-deleted) entry at that id is
       * treated as absent in both checks — `create` (`setDoc`) then overwrites it with the
       * fresh, non-archived document, so a deleted day is not a dead end that can never be
       * re-created.
       */
      async add(): Promise<void> {
        if (!store.canWrite()) return;
        const fresh = newDiary(store.tenantId(), store.authorKey());
        const existing = await store.diaryService.readOnce(fresh.okey);
        if (existing && !existing.isArchived) {
          store.alertService.showToast(store.i18n.create_exists());
          await editEntry(existing);
          return;
        }
        const edited = await openEditor(fresh, false);
        if (!edited) return;
        // the date may have been changed in the form: re-key, and re-check the target day
        const keyed = newDiary(store.tenantId(), store.authorKey(), edited.date);
        const target = { ...edited, okey: keyed.okey };
        if (target.okey !== fresh.okey) {
          const targetExisting = await store.diaryService.readOnce(target.okey);
          if (targetExisting && !targetExisting.isArchived) {
            store.alertService.showToast(store.i18n.create_exists());
            return;
          }
        }
        const ready = await withWeather(target);
        await store.diaryService.create({ ...ready, index: getDiaryIndex(ready) }, store.currentUser());
        store.diariesResource.reload();
      },

      edit: editEntry,

      async view(diary: DiaryModel): Promise<void> {
        const { DiaryViewModal } = await import('@okr/content-diary-ui');
        const modal = await store.modalController.create({
          component: DiaryViewModal,
          cssClass: 'wide-modal',
          componentProps: { diary, i18n: store.i18n },
        });
        await modal.present();
        const { role } = await modal.onWillDismiss();
        if (role === 'edit') await editEntry(diary);
      },

      async delete(diary: DiaryModel): Promise<void> {
        const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
        if (!confirmed) return;
        await store.diaryService.delete(diary, store.currentUser());
        store.diariesResource.reload();
      },

      /** The single-entry repair for the 2'025 day entries the import left at code -1. */
      async refreshWeather(diary: DiaryModel): Promise<void> {
        const coords = await coordinatesOf(diary.location);
        if (!coords) { store.alertService.showToast(store.i18n.weather_no_coords()); return; }
        const weather = await store.weatherService.fetch({ date: diary.date, ...coords }).catch(() => null);
        if (!weather) { store.alertService.showToast(store.i18n.weather_draft_hint()); return; }
        // DiaryService.update already raises its own confirmation toast — no second one here.
        await store.diaryService.update({ ...diary, weather }, store.currentUser());
        store.diariesResource.reload();
      },

      async openDrive(diary: DiaryModel): Promise<void> {
        const url = driveFolderUrl(diary.driveFolderId);
        if (url) await Browser.open({ url });
      },
    };
  }),
);
