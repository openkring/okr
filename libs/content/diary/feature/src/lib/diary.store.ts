import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Browser } from '@capacitor/browser';
import { firstValueFrom, of } from 'rxjs';

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

/** okr-list-filter reports "all years" as a number below 1000 (see yearMatches in shared-categories). */
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
    /** Coordinates of a resolved location, for the weather call; undefined for free text. */
    const coordinatesOf = async (location: AvatarInfo | undefined): Promise<{ latitude: number; longitude: number } | undefined> => {
      if (!location?.key) return undefined;
      const record = await firstValueFrom(store.locationService.read(location.key));
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

    const openEditor = async (diary: DiaryModel): Promise<DiaryModel | undefined> => {
      const { DiaryEditModal } = await import('@okr/content-diary-ui');
      const modal = await store.modalController.create({
        component: DiaryEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          diary, i18n: store.i18n, currentUser: store.currentUser(), tenantId: store.tenantId(),
          allTags: store.appStore.getTags('diary'), travelTrips: store.travelTrips(), readOnly: false,
        },
      });
      // The pickers live here, not in the modal: the modal is a form container and must not
      // inject this store back (see the dynamic import above). Ionic sets `componentInstance`
      // on the modal element as soon as `create()` attaches the component to the DOM — before
      // `present()` resolves — but the stencil-generated `HTMLIonModalElement` type does not
      // declare it, hence the cast via `unknown`.
      // `OutputRef.subscribe` returns an `OutputRefSubscription`; it is not unsubscribed
      // because the modal (and its outputs) are destroyed on dismiss.
      const instance = (modal as unknown as { componentInstance: InstanceType<typeof DiaryEditModal> }).componentInstance;
      instance.locationSelectClicked.subscribe(async () => {
        const result = await store.modelSelectService.selectLocation('', false, true);
        if (!result) return;
        if (result.kind === 'predefined') {
          const l = result.location;
          instance.applyLocation({ key: l.okey, name1: l.name, name2: '', label: l.name, modelType: 'location', type: l.type ?? '', subType: '' });
        } else {
          instance.applyLocation(undefined, result.label);
        }
      });
      instance.personSelectClicked.subscribe(async () => {
        const person = await store.modelSelectService.selectPersonAvatar(undefined, undefined, false, false);
        if (person) instance.applyPerson(person);
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<DiaryModel>();
      return role === 'confirm' && data ? data : undefined;
    };

    return {
      setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
      setSelectedYear(year: number) { patchState(store, { selectedYear: year < ALL_YEARS ? undefined : year }); },
      setSelectedState(selectedState: DiaryStateFilter) { patchState(store, { selectedState }); },

      /**
       * A new entry for today. The id is deterministic per date, so "one entry per day" is
       * enforced by reading the id first: if today already has an entry, it is opened for
       * editing instead of being overwritten.
       */
      async add(): Promise<void> {
        if (!store.canWrite()) return;
        const fresh = newDiary(store.tenantId(), store.authorKey());
        const existing = await store.diaryService.readOnce(fresh.okey);
        if (existing) {
          store.alertService.showToast(store.i18n.create_exists());
          await this.edit(existing);
          return;
        }
        const edited = await openEditor(fresh);
        if (!edited) return;
        // the date may have been changed in the form: re-key, and re-check the target day
        const keyed = newDiary(store.tenantId(), store.authorKey(), edited.date);
        const target = { ...edited, okey: keyed.okey };
        if (target.okey !== fresh.okey && await store.diaryService.readOnce(target.okey)) {
          store.alertService.showToast(store.i18n.create_exists());
          return;
        }
        const ready = await withWeather(target);
        await store.diaryService.create({ ...ready, index: getDiaryIndex(ready) }, store.currentUser());
        store.diariesResource.reload();
      },

      async edit(diary: DiaryModel): Promise<void> {
        const edited = await openEditor(diary);
        if (!edited) return;
        // the date is the id: changing it is a new document, which this UI does not offer
        const kept = { ...edited, date: diary.date, okey: diary.okey };
        const ready = await withWeather(kept);
        await store.diaryService.update({ ...ready, index: getDiaryIndex(ready) }, store.currentUser());
        store.diariesResource.reload();
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
        if (role === 'edit') await this.edit(diary);
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
        await store.diaryService.update({ ...diary, weather }, store.currentUser());
        store.alertService.showToast(store.i18n.weather_conf());
        store.diariesResource.reload();
      },

      async openDrive(diary: DiaryModel): Promise<void> {
        const url = driveFolderUrl(diary.driveFolderId);
        if (url) await Browser.open({ url });
      },
    };
  }),
);
