import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of, timeout } from 'rxjs';

import type { DiaryLocationPick, DiaryNeighbours } from '@okr/content-diary-ui';
import { DiaryMediaService, DiaryService, DiaryWeatherService } from '@okr/content-diary-data-access';
import {
  DIARY_FIRST_YEAR, DIARY_I18N_KEYS, DiaryMediaResult, DiaryRange, DiaryStateFilter, buildDiaryRangeTree, diaryRangeOfYear,
  diaryStateMatches, formatDiaryDate, getDiaryIndex, groupDiariesByMonth, hasDiaryWeather, newDiary,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import { AvatarInfo, DiaryModel, PersonModelName, TripModel } from '@okr/shared-models';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getTodayStr, hasRole, nameMatches } from '@okr/shared-util-core';
import { selectDate } from '@okr/shared-ui';

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
    weatherService: inject(DiaryWeatherService),
    mediaService: inject(DiaryMediaService),
    locationService: inject(LocationService),
    modelSelectService: inject(ModelSelectService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
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

    /** «Diesen Tag gibt es schon» — true when the author chose to edit the existing day. */
    const confirmEditExisting = async (date: string): Promise<boolean> => {
      const alert = await store.alertController.create({
        header: store.i18n.create_exists_title(),
        // single braces: translateAll strips Transloco's {{params}} (memory: translateall-strips-double-brace-params)
        message: store.i18n.create_exists_message().replace('{date}', formatDiaryDate(date)),
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.create_exists_edit(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      return role === 'confirm';
    };

    /**
     * Drive files per entry, cached for the store's lifetime so paging back and forth does not
     * call Drive again (spec 1.106 §2.3). A failed call is evicted, so the next visit retries.
     * The thumbnails come inline as `data:` URLs; the cache never outlives the list page.
     */
    const mediaCache = new Map<string, Promise<DiaryMediaResult>>();
    const loadMedia = (diary: DiaryModel, reload = false): Promise<DiaryMediaResult> => {
      if (reload) {   // the author changed the Drive folder: drop the listing and its slider renditions
        mediaCache.delete(diary.okey);
        for (const key of [...imageCache.keys()]) if (key.startsWith(`${diary.okey}/`)) imageCache.delete(key);
      }
      let pending = mediaCache.get(diary.okey);
      if (!pending) {
        pending = store.mediaService.list(diary.okey);
        pending.catch(() => mediaCache.delete(diary.okey));
        mediaCache.set(diary.okey, pending);
      }
      return pending;
    };

    /**
     * The single-entry repair for the day entries the import left at code -1, offered in the read
     * view. Returns the saved entry so the view can show the weather in place; undefined = no
     * weather (no coordinates, or Open-Meteo has none — the toast says which).
     */
    const refreshWeather = async (diary: DiaryModel): Promise<DiaryModel | undefined> => {
      const coords = await coordinatesOf(diary.location);
      if (!coords) { store.alertService.showToast(store.i18n.weather_no_coords()); return undefined; }
      const weather = await store.weatherService.fetch({ date: diary.date, ...coords }).catch(() => null);
      if (!weather) { store.alertService.showToast(store.i18n.weather_draft_hint()); return undefined; }
      const updated = { ...diary, weather };
      // DiaryService.update already raises its own confirmation toast — no second one here.
      await store.diaryService.update(updated, store.currentUser());
      store.diariesResource.reload();
      return updated;
    };

    /** Slider-size renditions, cached like the listings; a failed load is evicted and retried. */
    const imageCache = new Map<string, Promise<string>>();
    const loadImage = (diary: DiaryModel, fileId: string): Promise<string> => {
      const key = `${diary.okey}/${fileId}`;
      let pending = imageCache.get(key);
      if (!pending) {
        pending = store.mediaService.loadImage(diary.okey, fileId);
        pending.catch(() => imageCache.delete(key));
        imageCache.set(key, pending);
      }
      return pending;
    };

    /** prev/next/up of the shown entry (spec 1.106 §2.1) — queried, not taken from the loaded list. */
    const neighboursOf = async (diary: DiaryModel): Promise<DiaryNeighbours> => {
      const [prev, next, up] = await Promise.all([
        store.diaryService.findNeighbour(store.authorKey(), store.tenantId(), diary, 'prev'),
        store.diaryService.findNeighbour(store.authorKey(), store.tenantId(), diary, 'next'),
        store.diaryService.findUp(store.authorKey(), store.tenantId(), diary),
      ]);
      return { prev, next, up };
    };

    /** Read-only person modal from a diary avatar (pattern: TripViewModal.openPerson). */
    const openPersonView = async (avatar: AvatarInfo): Promise<void> => {
      if (avatar.modelType !== PersonModelName || !avatar.key) return;
      const person = store.appStore.getPerson(avatar.key);
      if (!person) return;
      const { PersonEditModal } = await import('@okr/subject-person-feature');
      const modal = await store.modalController.create({
        component: PersonEditModal,
        componentProps: {
          person,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags(PersonModelName),
          tenantId: store.appStore.tenantId(),
          genders: store.appStore.getCategory('gender'),
          readOnly: true,
        },
      });
      await modal.present();
      await modal.onDidDismiss();
    };

    /** Read-only location modal from the diary's resolved location. */
    const openLocationView = async (avatar: AvatarInfo): Promise<void> => {
      if (!avatar.key) return;
      const location = await firstValueFrom(store.locationService.read(avatar.key).pipe(timeout(5000))).catch(() => undefined);
      if (!location) return;
      const { LocationEditModal } = await import('@okr/location-feature');
      const modal = await store.modalController.create({
        component: LocationEditModal,
        componentProps: { location, currentUser: store.appStore.currentUser(), readOnly: true },
      });
      await modal.present();
      await modal.onDidDismiss();
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
       * A new entry for any day (spec 1.106 §1.4). The date is picked FIRST, so a taken day is
       * caught before anything is typed: the alert offers to edit that day instead, and
       * cancelling writes nothing. A free day opens the editor with the date locked — it can no
       * longer collide afterwards. The id is deterministic per date; an ARCHIVED (soft-deleted)
       * entry at that id counts as absent — `create` (`setDoc`) overwrites it with the fresh,
       * non-archived document, so a deleted day is not a dead end.
       */
      async add(): Promise<void> {
        if (!store.canWrite()) return;
        const today = convertDateFormatToString(getTodayStr(DateFormat.StoreDate), DateFormat.StoreDate, DateFormat.IsoDate);
        const iso = await selectDate(store.modalController, today, store.i18n.create_pick_date());
        if (!iso) return;
        const date = convertDateFormatToString(iso.slice(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
        const fresh = newDiary(store.tenantId(), store.authorKey(), date);
        const existing = await store.diaryService.readOnce(fresh.okey);
        if (existing && !existing.isArchived) {
          if (await confirmEditExisting(date)) await editEntry(existing);
          return;
        }
        const edited = await openEditor(fresh, true);
        if (!edited) return;
        const target = { ...edited, date: fresh.date, scope: fresh.scope, okey: fresh.okey };
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
          componentProps: {
            diary, i18n: store.i18n, lang: store.lang(),
            neighbours: neighboursOf, openPerson: openPersonView, openLocation: openLocationView, loadMedia, loadImage, refreshWeather,
          },
        });
        await modal.present();
        // the modal pages in place — 'edit' carries the entry that was on screen
        const { data, role } = await modal.onWillDismiss<DiaryModel>();
        if (role === 'edit') await editEntry(data ?? diary);
      },
    };
  }),
);
