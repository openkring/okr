import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, NavController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, map, of, timeout } from 'rxjs';

import type { DiaryLocationPick, DiaryNeighbours } from '@okr/content-diary-ui';
import { DiaryAlbumService, DiaryMediaService, DiaryService, DiaryWeatherService } from '@okr/content-diary-data-access';
import {
  DIARY_FIRST_YEAR, DIARY_I18N_KEYS, DiaryFilter, DiaryMediaResult, DiaryRange, DiaryStateFilter, albumKey, albumRefOf,
  buildDiaryRangeTree, decodeDiaryFilter, diaryFilterLabel, diaryListUrl, diaryRangeOfYear, diaryStateMatches, encodeDiaryFilter,
  formatDiaryDate, getDiaryIndex, groupDiariesByMonth, hasDiaryWeather, inDiaryDateRange, newDiary,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import { AvatarInfo, DiaryAlbumKind, DiaryAlbumModel, DiaryModel, LocationModel, PersonModelName, TripModel } from '@okr/shared-models';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, addIndexElement, convertDateFormatToString, getTodayStr, nameMatches } from '@okr/shared-util-core';
import { selectDate } from '@okr/shared-ui';

export type DiaryStoreState = {
  searchTerm: string;
  /** a year, decade or century (spec 1.106 §1.2); undefined = every year (deliberately expensive) */
  selectedRange: DiaryRange | undefined;
  selectedState: DiaryStateFilter;
  /** month accordions on/off — remembered per device (spec 1.106 §1.1) */
  groupByMonth: boolean;
  /**
   * The active album, trip, tag or date filter (spec 1.114 §5); undefined = the year range.
   * An album/trip/tag filter is carried by the route's `listId` (`person.<okey>`, `trip.<okey>`, …);
   * a date filter has no listId and lives in the store only.
   */
  filter: DiaryFilter | undefined;
  /** the route segments this list was opened with — `setFilter`/`clearFilter` navigate from them */
  listId: string;
  contextMenuName: string;
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
  filter: undefined,
  listId: 'all',
  contextMenuName: 'c-diary',
};

/** `history.state` key under which `setFilter` hands the full filter (title, dates) to the new list. */
const FILTER_STATE_KEY = 'diaryFilter';

function readHandedFilter(): DiaryFilter | undefined {
  try {
    const handed = (history.state ?? {})[FILTER_STATE_KEY] as DiaryFilter | undefined;
    return handed && typeof handed.key === 'string' && typeof handed.kind === 'string' ? handed : undefined;
  } catch { return undefined; }
}

function tagsOf(tags: string): string[] {
  return [...new Set((tags ?? '').split(',').map(tag => tag.trim()).filter(tag => !!tag))].sort((a, b) => a.localeCompare(b));
}

function locationAvatar(l: LocationModel): AvatarInfo {
  return { key: l.okey, name1: l.name, name2: '', label: l.name, modelType: 'location', type: l.type ?? '', subType: '' };
}

export const DiaryStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    diaryService: inject(DiaryService),
    albumService: inject(DiaryAlbumService),
    navController: inject(NavController),
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
      params: resourceParams(() => ({
        authorKey: store.appStore.fbUser()?.uid ?? '',
        tenantId: store.appStore.tenantId(),
        range: store.selectedRange(),
        // while a filter is active the year range is not shown, so it is not queried either
        paused: !!store.filter(),
      })),
      stream: ({ params }) => params.authorKey && params.tenantId && !params.paused
        ? store.diaryService.listByRange(params.authorKey, params.tenantId, params.range)
        : of([] as DiaryModel[]),
    }),
    tripsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }) => params.tenantId ? store.diaryService.listTravelTrips(params.tenantId) : of([] as TripModel[]),
    }),
  })),
  withProps(store => ({
    /** The entries of the active filter, over all years (spec 1.114 §3, §5). */
    filteredResource: rxResource({
      params: resourceParams(() => {
        const filter = store.filter();
        const trip = filter?.kind === 'trip' ? store.tripsResource.value()?.find(t => t.okey === filter.key) : undefined;
        return {
          authorKey: store.appStore.fbUser()?.uid ?? '',
          tenantId: store.appStore.tenantId(),
          kind: filter?.kind ?? '',
          key: filter?.key ?? '',
          from: filter?.from ?? '',
          to: filter?.to ?? '',
          // identities only: the trip's span decides which untagged days belong to it
          trip: trip ? { okey: trip.okey, startDate: trip.startDate ?? '', endDate: trip.endDate ?? '' } : undefined,
        };
      }),
      stream: ({ params }) => {
        const { authorKey, tenantId, kind, key, from, to } = params;
        if (!authorKey || !tenantId || !kind) return of([] as DiaryModel[]);
        if (kind === 'date') return store.diaryService.listByDateRange(authorKey, tenantId, from, to);
        // until the trips are loaded: the days pointing at it by tripKey only
        const entries$ = kind === 'trip'
          ? store.diaryService.listByTrip(authorKey, tenantId, (params.trip ?? { okey: key, startDate: '', endDate: '' }) as TripModel)
          : store.diaryService.listByAlbum(authorKey, tenantId, key);
        // the Datum segment's narrowing of an album, tag or trip («Anna, 2015–2019»)
        return entries$.pipe(map(diaries => diaries.filter(d => inDiaryDateRange(d.date, from, to))));
      },
    }),
    /** Album titles for a filter opened from a link without one (deep link, reload). Loaded only then. */
    titleAlbumsResource: rxResource({
      params: resourceParams(() => {
        const filter = store.filter();
        const needed = !!filter && !filter.title && (filter.kind === 'person' || filter.kind === 'location' || filter.kind === 'event');
        return { authorKey: needed ? store.appStore.fbUser()?.uid ?? '' : '', tenantId: store.appStore.tenantId() };
      }),
      stream: ({ params }) => store.albumService.list(params.authorKey, params.tenantId),
    }),
  })),
  withComputed(store => ({
    authorKey: computed(() => store.appStore.fbUser()?.uid ?? ''),
    tenantId: computed(() => store.appStore.tenantId()),
    currentUser: computed(() => store.appStore.currentUser()),
    isLoading: computed(() => store.filter() ? store.filteredResource.isLoading() : store.diariesResource.isLoading()),
    diaries: computed((): DiaryModel[] => (store.filter() ? store.filteredResource.value() : store.diariesResource.value()) ?? []),
    travelTrips: computed((): TripModel[] => store.tripsResource.value() ?? []),
    /** The filter with its title resolved when the link carried none (album, trip or tag name). */
    activeFilter: computed((): DiaryFilter | undefined => {
      const filter = store.filter();
      if (!filter || filter.title || filter.kind === 'date') return filter;
      if (filter.kind === 'tag') return { ...filter, title: filter.key.slice('tag.'.length) };
      if (filter.kind === 'trip') {
        const trip = store.tripsResource.value()?.find(t => t.okey === filter.key);
        return trip ? { ...filter, title: trip.name } : filter;
      }
      const album = store.titleAlbumsResource.value()?.find(a => albumKey(a.kind, albumRefOf(a)) === filter.key);
      return album ? { ...filter, title: album.title } : filter;
    }),
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
    /** The chip text, «Anna Muster · 01.01.2015–31.12.2019»; '' without a filter. */
    filterLabel: computed((): string => {
      const filter = store.activeFilter();
      if (!filter) return '';
      return diaryFilterLabel(filter, formatDiaryDate, { from: store.i18n.albums_filter_from(), to: store.i18n.albums_filter_to() })
        || filter.key;
    }),
    filteredDiaries: computed(() => store.diaries().filter(diary =>
      diaryStateMatches(diary, store.selectedState())
      && nameMatches(diary.index || getDiaryIndex(diary), store.searchTerm()))),
  })),
  withComputed(store => ({
    groupedDiaries: computed(() => groupDiariesByMonth(store.filteredDiaries())),
  })),
  withMethods(store => {
    /** Reloads the list on screen: the filter's entries, or the year range. */
    const reloadList = (): void => {
      if (store.filter()) store.filteredResource.reload();
      else store.diariesResource.reload();
    };

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

    /** Albums point at real things only: a free-text location resolves to nothing. */
    const pickAlbumLocation = async (): Promise<AvatarInfo | undefined> => {
      const result = await store.modelSelectService.selectLocation('', false, false);
      return result?.kind === 'predefined' ? locationAvatar(result.location) : undefined;
    };

    const navigateToList = async (listId: string, filter?: DiaryFilter): Promise<void> => {
      const url = diaryListUrl(listId, store.contextMenuName());
      if (filter) await store.navController.navigateForward(url, { state: { [FILTER_STATE_KEY]: filter } });
      else await store.navController.navigateBack(url);
    };

    const setFilter = async (filter: DiaryFilter | undefined): Promise<void> => {
      if (!filter) { await clearFilter(); return; }
      const listId = encodeDiaryFilter(filter);
      // a date filter has no listId; an album already in the route is applied in place
      if (filter.kind === 'date' || listId === store.listId()) { patchState(store, { filter }); return; }
      await navigateToList(listId, filter);
    };

    /** Back to the year range: in place for a date filter, else back to the unfiltered list. */
    const clearFilter = async (): Promise<void> => {
      if (!decodeDiaryFilter(store.listId())) { patchState(store, { filter: undefined }); return; }
      await navigateToList('all');
    };

    const openEditor = async (diary: DiaryModel, lockDate: boolean): Promise<DiaryModel | undefined> => {
      const { DiaryEditModal } = await import('@okr/content-diary-ui');
      // one-shot: the picker only needs the list while the modal is open; a failure leaves the picker with the entry's own slugs
      const authorKey = store.authorKey();
      const eventAlbums = authorKey
        ? await firstValueFrom(store.albumService.list(authorKey, store.tenantId()).pipe(timeout(5000)))
            .then(albums => albums.filter(a => a.kind === 'event' && !a.isArchived))
            .catch((ex: unknown) => { console.warn('DiaryStore.openEditor: event albums not loaded', ex); return [] as DiaryAlbumModel[]; })
        : [];
      const modal = await store.modalController.create({
        component: DiaryEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          diary, i18n: store.i18n, currentUser: store.currentUser(), tenantId: store.tenantId(),
          allTags: store.appStore.getTags('diary'), travelTrips: store.travelTrips(), eventAlbums, readOnly: false, lockDate,
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
      reloadList();
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
      reloadList();
    };

    /**
     * Opens the trip edit modal and writes the result; the saved trip (okey set on create), or
     * undefined when cancelled or the write failed (FirestoreService already toasted the failure).
     */
    const editTravelTrip = async (trip?: TripModel): Promise<TripModel | undefined> => {
      const isNew = !trip;
      // dynamic import: the modal must not pull the store's module graph back in (store-modal-dynamic-import)
      const { DiaryTripEditModal } = await import('@okr/content-diary-ui');
      const draft = trip ?? Object.assign(new TripModel(store.tenantId()), { type: 'travel' });
      const modal = await store.modalController.create({
        component: DiaryTripEditModal,
        componentProps: { trip: draft, isNew, i18n: store.i18n },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<TripModel>();
      if (role !== 'confirm' || !data) return undefined;
      const saved: TripModel = { ...data, index: addIndexElement(addIndexElement('', 'n', data.name), 'd', data.startDate) };
      const key = isNew
        ? await store.diaryService.createTravelTrip(saved, store.currentUser())
        : await store.diaryService.updateTravelTrip(saved, store.currentUser());
      if (!key) return undefined;
      if (isNew) saved.okey = key;
      return saved;
    };

    return {
      editTravelTrip,

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
        reloadList();
      },

      edit: editEntry,

      setFilter,
      clearFilter,

      /**
       * Called by the list with its route segments. A filter listId (`person.<okey>`, `trip.<okey>`,
       * …) becomes the filter; `setFilter` handed the full filter (title, dates) along in the
       * navigation state, a deep link has only the key and its title is resolved (`activeFilter`).
       */
      initFromRoute(listId: string, contextMenuName: string): void {
        patchState(store, { listId, contextMenuName: contextMenuName || 'c-diary' });
        const decoded = decodeDiaryFilter(listId);
        if (!decoded) return;
        const handed = readHandedFilter();
        const filter: DiaryFilter = handed && handed.kind === decoded.kind && handed.key === decoded.key
          ? handed
          : { ...decoded, title: '', from: '', to: '' };
        patchState(store, { filter });
      },

      /** «Alben» (spec 1.114 §4): pick an album, trip, tag or date range and filter the list by it. */
      async openAlbums(): Promise<void> {
        const authorKey = store.authorKey();
        const tenantId = store.tenantId();
        if (!authorKey || !tenantId) return;
        // dynamic import: the modals must not pull the store's module graph back in (store-modal-dynamic-import)
        const { DiaryAlbumsModal, DiaryAlbumEditModal } = await import('@okr/content-diary-ui');
        let albums = await firstValueFrom(store.albumService.list(authorKey, tenantId).pipe(timeout(10000)))
          .catch((ex: unknown) => {
            console.warn('DiaryStore.openAlbums: albums not loaded', ex);
            void store.alertService.showToast(store.i18n.albums_load_failed());
            return [] as DiaryAlbumModel[];
          });
        let trips = store.travelTrips();

        // The lists are kept here and merged after each write rather than re-read: a re-read
        // right after a write can still return the pre-write snapshot (firstvaluefrom-readmodel-returns-stale).
        const editAlbum = async (kind: DiaryAlbumKind, album?: DiaryAlbumModel): Promise<DiaryAlbumModel[]> => {
          const isNew = !album;
          const draft = album ?? Object.assign(new DiaryAlbumModel(tenantId), { kind, authorKey });
          const modal = await store.modalController.create({
            component: DiaryAlbumEditModal,
            componentProps: {
              album: draft, isNew, i18n: store.i18n, currentUser: store.currentUser(),
              selectPerson: () => store.modelSelectService.selectPersonAvatar(undefined, undefined, false, false),
              selectLocation: pickAlbumLocation,
            },
          });
          await modal.present();
          const { data, role } = await modal.onWillDismiss<DiaryAlbumModel>();
          if (role !== 'confirm' || !data) return albums;
          const saved: DiaryAlbumModel = { ...data, index: addIndexElement('', 'n', data.title) };
          const key = isNew
            ? await store.albumService.create(saved, store.currentUser())
            : await store.albumService.update(saved, store.currentUser());
          if (key) {
            if (isNew) saved.okey = key;
            albums = [...albums.filter(a => a.okey !== saved.okey), saved];
          }
          return albums;
        };

        const archiveAlbum = async (album: DiaryAlbumModel): Promise<DiaryAlbumModel[]> => {
          // the row goes only when the write went through; FirestoreService already toasted a failure
          if (await store.albumService.archive(album, store.currentUser())) albums = albums.filter(a => a.okey !== album.okey);
          return albums;
        };

        const editTrip = async (trip?: TripModel): Promise<TripModel[]> => {
          const saved = await editTravelTrip(trip);
          if (saved) trips = [...trips.filter(t => t.okey !== saved.okey), saved];
          return trips;
        };

        const modal = await store.modalController.create({
          component: DiaryAlbumsModal,
          cssClass: 'wide-modal',
          componentProps: {
            i18n: store.i18n, albums, trips, tags: tagsOf(store.appStore.getTags('diary')),
            imgixBaseUrl: store.appStore.env.services.imgixBaseUrl,
            newestDate: (key: string) => store.diaryService.newestAlbumDate(authorKey, tenantId, key),
            editAlbum, editTrip, archiveAlbum, activeFilter: store.activeFilter(),
            openTrip: (trip: TripModel) => { void store.navController.navigateForward(`/diary/trip/${trip.okey}`); },
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<DiaryFilter>();
        if (role === 'filter' && data) await setFilter(data);
      },

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
