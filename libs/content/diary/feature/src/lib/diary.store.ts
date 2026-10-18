import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Browser } from '@capacitor/browser';
import { firstValueFrom, of, timeout } from 'rxjs';

import type { DiaryLocationPick } from '@okr/content-diary-ui';
import { DiaryService, DiaryWeatherService } from '@okr/content-diary-data-access';
import { AppConfigService } from '@okr/shared-data-access';
import {
  DIARY_FIRST_YEAR, DIARY_I18N_KEYS, DiaryRange, DiaryStateFilter, buildDiaryRangeTree, diaryRangeOfYear,
  diaryStateMatches, driveFolderUrl, getDiaryIndex, groupDiariesByMonth, hasDiaryWeather, newDiary,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import { AvatarInfo, DiaryModel, DiaryPeriod, TripModel } from '@okr/shared-models';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { hasRole, nameMatches } from '@okr/shared-util-core';

export type DiaryStoreState = {
  searchTerm: string;
  /** a year, decade or century (spec 1.106 §1.2); undefined = every year (deliberately expensive) */
  selectedRange: DiaryRange | undefined;
  selectedState: DiaryStateFilter;
  /** month accordions on/off — remembered per device (spec 1.106 §1.1) */
  groupByMonth: boolean;
};

const GROUP_BY_MONTH_KEY = 'okr.diary.groupByMonth';

function readGroupByMonth(): boolean {
  try { return localStorage.getItem(GROUP_BY_MONTH_KEY) === 'true'; } catch { return false; }
}

function writeGroupByMonth(value: boolean): void {
  try { localStorage.setItem(GROUP_BY_MONTH_KEY, String(value)); } catch { /* private mode: not remembered */ }
}

const initialState: DiaryStoreState = {
  searchTerm: '',
  selectedRange: diaryRangeOfYear(new Date().getFullYear()),
  selectedState: 'all',
  groupByMonth: readGroupByMonth(),
};

export const DiaryStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    diaryService: inject(DiaryService),
    appConfigService: inject(AppConfigService),
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
        range: store.selectedRange(),
      }),
      stream: ({ params }) => params.authorKey && params.tenantId
        ? store.diaryService.listByRange(params.authorKey, params.tenantId, params.range)
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
    rangeTree: computed(() => buildDiaryRangeTree(DIARY_FIRST_YEAR, new Date().getFullYear())),
    /**
     * The active UI language, for weekday and month names. Transloco's language is not a signal;
     * reading a translated label first makes this re-evaluate when the language switches.
     */
    lang: computed(() => { store.i18n.title(); return store.i18nService.getActiveLang(); }),
    // the rule decides, not the role: whoever is signed in writes their own diary
    canWrite: computed(() => !!store.appStore.fbUser()?.uid),
  })),
  withComputed(store => ({
    filteredDiaries: computed(() => store.diaries().filter(diary =>
      diaryStateMatches(diary, store.selectedState())
      && nameMatches(diary.index || getDiaryIndex(diary), store.searchTerm()))),
  })),
  withComputed(store => ({
    groupedDiaries: computed(() => groupDiariesByMonth(store.filteredDiaries())),
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
      setSelectedRange(selectedRange: DiaryRange | undefined) { patchState(store, { selectedRange }); },
      toggleGroupByMonth() {
        const groupByMonth = !store.groupByMonth();
        writeGroupByMonth(groupByMonth);
        patchState(store, { groupByMonth });
      },
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

      /**
       * Spec 1.77 D7 — the travel period this diary app publishes (`AppConfig.travelFrom`/
       * `travelTo`), admin-only. Diary-transfer columns with empty bounds inherit it.
       * The modal is imported dynamically: it lives in the ui lib this store already loads
       * lazily (memory: store-modal-dynamic-import).
       */
      async editPeriod(): Promise<void> {
        if (!hasRole('admin', store.currentUser())) return;
        const config = store.appStore.appConfig();
        // legacy config docs lack both fields — Firestore reads skip model defaults
        const period: DiaryPeriod = { travelFrom: config?.travelFrom ?? '', travelTo: config?.travelTo ?? '' };
        const { DiaryPeriodModal } = await import('@okr/content-diary-ui');
        const modal = await store.modalController.create({
          component: DiaryPeriodModal,
          componentProps: { period, i18n: store.i18n },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<DiaryPeriod>();
        if (role === 'confirm' && data) {
          await store.appConfigService.setTravelPeriod(store.tenantId(), {
            travelFrom: data.travelFrom ?? '', travelTo: data.travelTo ?? '',
          });
        }
      },

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
