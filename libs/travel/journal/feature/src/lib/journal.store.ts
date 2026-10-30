import { computed, effect, inject, untracked } from '@angular/core';
import { firstValueFrom, Subscription } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { doc, getDoc } from 'firebase/firestore';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { AvatarInfo, JournalBookModel, JournalChange, TRANSPORT_MODES, TransportMode } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { FIRESTORE } from '@okr/shared-config';
import { AppVersionConfig, compareAppVersions, CURRENT_APP_VERSION } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import {
  ChangeDraft, JournalBookService, JournalDb, JournalIdentityService, JournalLockService, JournalPeerService, JournalPhotos, JournalSyncService, JournalWebWriter, OsmExtract, PickedPhoto, SkippedPhoto,
  toBase64,
} from '@okr/travel-journal-data-access';
import {
  BOOK_I18N_KEYS, BOOK_LABEL_MAX, bookLabelsOf, JournalBookI18n, bookPrintCandidates, entityStateKey, hasOthersBlocks, pagesOf, PRINT_FILL_LONG_PX, PRINT_FILL_SHORT_PX, FootprintFormModel, JOURNAL_I18N_KEYS, JournalI18n, FootprintView, footprintPosition, footprintsOf, ImageView, imagesOf, JournalState,
  allPhotoFiles, commentsOf, CommentView, likeKey, likesOf, JournalPhotoMode, JournalTileSource, journalsOf, journalTilePlan, MapArea, mapLayers, MapPlace, mapPlaces, parseMapAreas, parsePhotoMode, TileJob, tilesToFree, JournalWriteRefused, lastBlockOrder, materialize, orderBetween, reorderedOrders, CONFLICT_FIELDS, dismissedField, isConflictCopyKey, originalOfCopy, BlockView, publishedPhotoFiles, viewOf,
  JournalLock, LOCK_HEARTBEAT_MS, LOCK_TTL_MS, lockedBy, mergeLocks, BoundAuthor, JournalWriteSlow, mergePending,
} from '@okr/travel-journal-util';

import { BookExportStatus, JournalBookExporter, NO_BOOK_EXPORT } from './journal-book-export.service';
import { JournalFileUrlService } from './journal-file-url.service';
import { JournalWebPhotos, WebPhoto } from './journal-web-photos.service';

const SYNC_INTERVAL_MS = 2 * 60 * 1000;
const META_PHOTO_MODE = 'photoMode';
const META_OFFLINE_MAP = 'offlineMap:'; // + journalKey
const MAP_WORKERS = 4; // parallel tile requests: polite to GIBS, the USGS WMS, swisstopo and Protomaps
const PRESENT_CHUNK = 200;
const META_ACTIVE_JOURNAL = 'activeJournal'; // the journal last opened: the one P2P runs for
const META_PHOTOS_PAUSED = 'photosPaused'; // before the three photo modes
const META_WRITE_MIN_VERSION = 'writeMinVersion'; // app-version/app-version journalWriteMinVersion, cached for offline

/**
 * The travel journal on this device (spec 1.113, plan 2). Reads and writes only SQLite through
 * JournalDb / JournalIdentityService — no Firestore, no app-config — so it works after an offline
 * cold start. Every action becomes change records; the in-memory state is updated only after the
 * database write succeeded. Plan 4: JournalSyncService exchanges the records with Firebase when
 * online (on start, when the network returns and every two minutes); offline nothing changes.
 */
export type FootprintFields = Partial<Pick<FootprintView, 'title' | 'placeName' | 'date' | 'time' | 'latitude' | 'longitude' | 'publishState'>> & { transport?: string };

interface JournalStoreState {
  ready: boolean;
  native: boolean;
  error: string;
  changes: JournalChange[];
  photoMode: JournalPhotoMode;
  activeJournalKey: string;
  offlineMaps: Record<string, OfflineMapStatus>; // per journal
  bookPrints: BookPrintStatus;
  webLoaded: boolean; // web view: the authored journals have been loaded (or failed to)
  bookExport: BookExportStatus;
  locks: Record<string, JournalLock>; // edit locks of the active journal (spec 1.126 §6.2)
  writeMinVersion: string; // '' = no minimum known; below it the app may read but not write (spec 1.126 §6.4)
  lockClock: number; // Date.now(), refreshed every LOCK_CLOCK_MS, so lockOf re-evaluates expiry
  webUpload: { done: number; total: number } | undefined; // browser photo upload in progress (spec 1.126 phase 3 §3)
}

/**
 * A journal's offline map (plans 6, 6b): none yet, downloading, complete, or finished with failed tiles.
 * `areaIds` are the areas the last download covered — an area added later is not offline yet.
 */
export interface OfflineMapStatus {
  state: 'none' | 'loading' | 'ready' | 'partial'; done: number; total: number; failed: number; at: string; areaIds: string[];
}
export const NO_OFFLINE_MAP: OfflineMapStatus = { state: 'none', done: 0, total: 0, failed: 0, at: '', areaIds: [] };

function parseOfflineMap(raw: string | undefined): OfflineMapStatus {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<OfflineMapStatus>) : undefined;
    if (value?.state === 'ready' || value?.state === 'partial') {
      return { ...NO_OFFLINE_MAP, ...value, areaIds: Array.isArray(value.areaIds) ? value.areaIds.filter((a) => typeof a === 'string') : [] };
    }
  } catch {
    // a damaged entry counts as no map
  }
  return NO_OFFLINE_MAP;
}

/**
 * Print photos for the book (design §5.6): `uploaded` photos are in the bucket, `missing` are not in this iPad's Photos
 * library (or outside a limited selection), `failed` could not be read, written or uploaded — they are tried again next time.
 */
export interface BookPrintStatus {
  state: 'idle' | 'running' | 'done' | 'offline'; journalKey: string; done: number; total: number; uploaded: number; missing: number; failed: number;
}
export const NO_BOOK_PRINTS: BookPrintStatus = { state: 'idle', journalKey: '', done: 0, total: 0, uploaded: 0, missing: 0, failed: 0 };

/** The browser's offline flag (always false outside a browser). */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

const PRINT_CHUNK = 50; // prepareJournalPhotoUploads takes at most 50 files per call
const printFileOf = (imageKey: string): string => `${imageKey}-print.jpg`;

const initialState: JournalStoreState = {
  ready: false, native: Capacitor.isNativePlatform(), error: '', changes: [], photoMode: 'all', activeJournalKey: '', offlineMaps: {}, bookPrints: NO_BOOK_PRINTS,
  webLoaded: false, bookExport: NO_BOOK_EXPORT, locks: {}, writeMinVersion: '', lockClock: 0, webUpload: undefined,
};
const LOCK_CLOCK_MS = 15_000;
const isWebPhoto = (photo: PickedPhoto): photo is WebPhoto => 'imageKey' in photo && 'printSize' in photo;

export const JournalStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    db: inject(JournalDb),
    identity: inject(JournalIdentityService),
    syncService: inject(JournalSyncService),
    peerService: inject(JournalPeerService),
    fileUrl: inject(JournalFileUrlService),
    appStore: inject(AppStore),
    bookService: inject(JournalBookService),
    bookExporter: inject(JournalBookExporter),
    lockService: inject(JournalLockService),
    webWriter: inject(JournalWebWriter),
    webPhotos: inject(JournalWebPhotos),
    firestore: inject(FIRESTORE),
  })),
  withProps(() => ({
    i18n: inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n,
    bookI18n: inject(I18nService).translateAll(BOOK_I18N_KEYS) as JournalBookI18n,
  })),
  withComputed((store) => {
    const journalState = computed<JournalState>(() => materialize(store.changes()));
    return {
      journalState,
      journals: computed(() => journalsOf(journalState())),
      /** Who writes: on the iPad the bound author (SQLite, offline too); in the browser the signed-in person. */
      author: computed<BoundAuthor | undefined>(() => {
        if (store.native()) return store.identity.author();
        const personKey = store.appStore.currentUser()?.personKey;
        if (!personKey) return undefined;
        const person = store.appStore.currentPerson();
        return { personKey, name: person ? `${person.firstName} ${person.lastName}`.trim() : '' };
      }),
      /** Whether this device may write at all (menus and actions follow it, spec 1.126 phase 3 §2). */
      canWrite: computed(() => (store.native() ? !!store.identity.author() : !!store.appStore.currentUser()?.personKey)),
      syncStatus: computed(() => store.syncService.status()),
      peerStatus: computed(() => store.peerService.status()),
    };
  }),
  withMethods((store) => {
    let stopWeb: (() => void) | undefined; // the live web view's Firestore listeners
    let webRefresh: ReturnType<typeof setInterval> | undefined;
    let webPersonKey = '';
    let pending: JournalChange[] = []; // browser: records written here that no snapshot has confirmed yet
    function stopWebView(): void {
      stopWeb?.();
      stopWeb = undefined;
      webPersonKey = '';
      pending = [];
      if (webRefresh) clearInterval(webRefresh);
      webRefresh = undefined;
    }

    /** Stamps and stores the drafts, then applies them in memory. */
    async function write(drafts: ChangeDraft[]): Promise<JournalChange[]> {
      const minVersion = store.writeMinVersion();
      if (minVersion && compareAppVersions(CURRENT_APP_VERSION, minVersion) < 0) throw new JournalWriteRefused('outdated');
      if (!store.native()) return writeWeb(drafts);
      const changes = await store.identity.stampChanges(drafts);
      patchState(store, { changes: [...store.changes(), ...changes] });
      store.peerService.push(changes); // the other iPad, when connected, gets it at once
      return changes;
    }

    /**
     * The browser write (spec 1.126 phase 3, design §2): stamp, show at once (pending), commit to Firestore.
     * A refusal takes the records back out and rethrows; a commit not confirmed within 30 s keeps them (the SDK
     * keeps trying) and throws JournalWriteSlow, so the page can tell the user.
     */
    async function writeWeb(drafts: ChangeDraft[]): Promise<JournalChange[]> {
      if (isOffline()) throw new JournalWriteRefused('offline');
      const author = store.author();
      if (!author) throw new JournalWriteRefused('noAuthor');
      const tenantId = store.appStore.tenantId();
      if (!tenantId) throw new Error('journal: no tenant for the browser write');
      const changes = await store.webWriter.stamp(drafts, author.personKey, store.changes());
      if (changes.length === 0) return changes;
      pending = [...pending, ...changes];
      patchState(store, { changes: [...store.changes(), ...changes] });
      let result: 'confirmed' | 'slow';
      try {
        result = await store.webWriter.commit(changes, tenantId);
      } catch (error) {
        const ids = new Set(changes.map((c) => c.id));
        pending = pending.filter((c) => !ids.has(c.id));
        patchState(store, { changes: store.changes().filter((c) => !ids.has(c.id)) });
        throw error;
      }
      if (result === 'slow') throw new JournalWriteSlow();
      return changes;
    }

    function footprint(footprintKey: string): FootprintView | undefined {
      const view = viewOf(store.journalState()[entityStateKey('footprint', footprintKey)]);
      const journalKey = typeof view?.['journalKey'] === 'string' ? view['journalKey'] : undefined;
      return journalKey ? footprintsOf(store.journalState(), journalKey).find((f) => f.key === footprintKey) : undefined;
    }

    /**
     * Picks photos and builds one image record per imported photo (not yet written). `files` (browser only) are files
     * the page already picked inside the user's tap (a file dialog opened later may be ignored); native ignores it.
     */
    async function pickImages(journalKey: string, files?: File[] | Promise<File[]>): Promise<{ drafts: ChangeDraft[]; imageKeys: string[]; photos: PickedPhoto[]; skipped: SkippedPhoto[] }> {
      if (!store.author()) throw new JournalWriteRefused('noAuthor'); // before the picker opens
      if (!store.native()) return pickWebImages(journalKey, files);
      const { photos, skipped } = await JournalPhotos.pick({ journalKey });
      const drafts: ChangeDraft[] = [];
      const imageKeys: string[] = [];
      for (const photo of photos) {
        const key = crypto.randomUUID();
        imageKeys.push(key);
        drafts.push({
          journalKey, entity: 'image', entityKey: key, op: 'create',
          fields: {
            journalKey, takenAt: photo.takenAt, latitude: photo.latitude, longitude: photo.longitude,
            width: photo.width, height: photo.height, path2048: photo.path2048, path400: photo.path400,
            localIdentifier: photo.localIdentifier,
          },
        });
      }
      return { drafts, imageKeys, photos, skipped };
    }

    /**
     * Browser (spec 1.126 phase 3, design §3): picks files and uploads all their files FIRST; only photos whose
     * files are in the bucket get an image record, so an iPad never receives a block without its photos.
     */
    async function pickWebImages(journalKey: string, picked?: File[] | Promise<File[]>): Promise<{ drafts: ChangeDraft[]; imageKeys: string[]; photos: WebPhoto[]; skipped: SkippedPhoto[] }> {
      // offline every upload would fail and each photo would count as «skipped»: say «offline» instead
      if (isOffline()) throw new JournalWriteRefused('offline');
      const files = await (picked ?? store.webPhotos.pickFiles());
      if (files.length === 0) return { drafts: [], imageKeys: [], photos: [], skipped: [] };
      if (isOffline()) throw new JournalWriteRefused('offline'); // went offline while the dialog was open
      patchState(store, { webUpload: { done: 0, total: files.length } });
      let uploaded: { photos: WebPhoto[]; skipped: SkippedPhoto[] };
      try {
        uploaded = await store.webPhotos.upload(journalKey, files, (done, total) => patchState(store, { webUpload: { done, total } }));
      } finally {
        patchState(store, { webUpload: undefined });
      }
      const { photos, skipped } = uploaded;
      const drafts: ChangeDraft[] = [];
      const imageKeys: string[] = [];
      for (const photo of photos) {
        imageKeys.push(photo.imageKey);
        drafts.push({
          journalKey, entity: 'image', entityKey: photo.imageKey, op: 'create',
          fields: {
            journalKey, takenAt: photo.takenAt, latitude: photo.latitude, longitude: photo.longitude,
            width: photo.width, height: photo.height, path2048: photo.path2048, path400: photo.path400,
            localIdentifier: '',
          },
        });
      }
      return { drafts, imageKeys, photos, skipped };
    }

    /**
     * Writes the image + block records of a photo pick; in the browser then records each photo's print size in the
     * book (design §3). A slow commit keeps the records (they will land), so the prints are recorded then too; any
     * other failure records none. A failed print entry is logged only: the book falls back to the 2048 px file.
     */
    async function writePhotos(journalKey: string, drafts: ChangeDraft[], photos: PickedPhoto[]): Promise<void> {
      if (store.native()) {
        await write(drafts);
        return;
      }
      let slow: JournalWriteSlow | undefined;
      try {
        await write(drafts);
      } catch (error) {
        if (!(error instanceof JournalWriteSlow)) throw error;
        slow = error;
      }
      const tenantId = store.appStore.tenantId();
      const personKey = store.author()?.personKey;
      if (tenantId && personKey) {
        for (const photo of photos) {
          if (!isWebPhoto(photo)) continue;
          try {
            await store.bookService.setPrint(journalKey, tenantId, photo.imageKey, photo.printSize, personKey);
          } catch (error) {
            console.error('journal: recording the print size failed', photo.imageKey, error);
          }
        }
      }
      if (slow) throw slow;
    }

    /**
     * Where a block (or a conflict copy of one) lives — existence check only: every author may edit any
     * block (spec 1.126 §6); the merge, not the store, resolves a clash. A copy has no entity of its own,
     * so its footprint comes from the original's raw fields (the original may be archived by now).
     */
    function blockOf(blockKey: string): { footprint: FootprintView; journalKey: string; block: BlockView } {
      const entityKey = isConflictCopyKey(blockKey) ? originalOfCopy(blockKey) : blockKey;
      const state = store.journalState()[entityStateKey('section', entityKey)];
      const footprintKey = isConflictCopyKey(blockKey)
        ? Object.values(state?.fields['footprintKey'] ?? {})[0]?.value
        : viewOf(state)?.['footprintKey'];
      const fp = typeof footprintKey === 'string' ? footprint(footprintKey) : undefined;
      const block = fp?.blocks.find((b) => b.key === blockKey);
      if (!fp || !block) throw new Error(`unknown block ${blockKey}`);
      return { footprint: fp, journalKey: fp.journalKey, block };
    }

    /**
     * The `bases` of a write: for every conflict field written, the winning hlc the editor started from, or
     * '' ("based on nothing") when there is none. `hlcs` must be captured when the editor OPENED: a value
     * delivered while it was open was never seen, so it must not count as a base (spec 1.126 anti-goal 1). A field without a base would make the record count as legacy
     * and switch conflict detection off for everything before it.
     */
    function basesOf(hlcs: Record<string, string>, fields: Record<string, unknown>, conflictFields: readonly string[]): Record<string, string> | undefined {
      const bases: Record<string, string> = {};
      for (const field of Object.keys(fields)) if (conflictFields.includes(field)) bases[field] = hlcs[field] ?? '';
      return Object.keys(bases).length > 0 ? bases : undefined;
    }

    /** Re-reads the log after a download; keeps records a write added meanwhile. */
    async function reload(): Promise<void> {
      const stored = await store.db.listChanges();
      const ids = new Set(stored.map((c) => c.id));
      patchState(store, { changes: [...stored, ...store.changes().filter((c) => !ids.has(c.id))] });
    }

    async function syncNow(): Promise<void> {
      const author = store.author();
      const tenantId = store.appStore.tenantId();
      if (!store.native() || !store.ready() || !author || !tenantId) return;
      if (!(await Network.getStatus()).connected) return;
      await store.syncService.sync({
        tenantId,
        personKey: author.personKey,
        photoMode: store.photoMode(),
        photoFiles: (journalKey) => {
          const images = imagesOf(store.journalState(), journalKey);
          return { published: publishedPhotoFiles(footprintsOf(store.journalState(), journalKey), images), all: allPhotoFiles(images) };
        },
        onRecordsStored: reload,
        onPhotosStored: () => store.fileUrl.refresh(),
      });
      // the peer secret arrives with the first sync of a journal: P2P can start now
      if (store.peerService.status().state === 'noSecret') void startPeers();
      void fillWeather();
    }

    /**
     * Weather for footprints that have a date and a position but no weather yet (spec §6.4, plan 8): at most
     * ten per round, never for a future day. A failure only means «next round».
     */
    let fillingWeather = false;
    async function fillWeather(): Promise<void> {
      if (fillingWeather || !store.author()) return;
      fillingWeather = true;
      try {
        const today = getTodayStr(DateFormat.StoreDate);
        const todo = journalsOf(store.journalState()).flatMap((j) => footprintsOf(store.journalState(), j.key))
          .filter((f) => /^\d{8}$/.test(f.date) && f.date <= today && f.latitude !== undefined && f.longitude !== undefined && !f.weather)
          .slice(0, 10);
        for (const fp of todo) {
          const weather = await store.syncService.fetchWeather(fp.date, fp.latitude as number, fp.longitude as number).catch(() => null);
          if (weather) await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: fp.key, op: 'set', fields: { weather } }]);
        }
      } finally {
        fillingWeather = false;
      }
    }

    // Edit locks (spec 1.126 §6.2): memory + P2P + Firestore when online, all best effort.
    function receiveLock(lock: JournalLock): void {
      if (lock.journalKey !== store.activeJournalKey()) return;
      patchState(store, { locks: mergeLocks(store.locks(), [lock]) });
    }
    const heartbeats = new Map<string, ReturnType<typeof setInterval>>();
    let lockWatch: Subscription | undefined;
    let lockClock: ReturnType<typeof setInterval> | undefined;
    let watched = new Set<string>(); // entities the last Firestore snapshot held
    let lockJournalKey = ''; // the journal the lock state belongs to

    function publishLock(lock: JournalLock): void {
      patchState(store, { locks: mergeLocks(store.locks(), [lock]) });
      store.peerService.pushLock(lock);
      const tenantId = store.appStore.tenantId();
      // fire and forget: on Wi-Fi without internet a Firestore write never settles, and editing must not wait for it
      if (lock.until > 0 && tenantId) void Network.getStatus().then((n) => n.connected && void store.lockService.put(lock, tenantId));
    }

    function stopLockWatch(): void {
      lockWatch?.unsubscribe();
      lockWatch = undefined;
      lockJournalKey = '';
      watched = new Set();
      for (const timer of heartbeats.values()) clearInterval(timer);
      heartbeats.clear();
      patchState(store, { locks: {} });
    }

    /** Idempotent: starts the clock and, when online and not yet running for this journal, the Firestore watch. */
    async function startLockWatch(journalKey: string): Promise<void> {
      if (lockJournalKey !== journalKey) {
        stopLockWatch();
        lockJournalKey = journalKey;
      }
      patchState(store, { lockClock: Date.now() });
      lockClock ??= setInterval(() => patchState(store, { lockClock: Date.now() }), LOCK_CLOCK_MS);
      if (lockWatch || !(await Network.getStatus()).connected || lockWatch) return; // second check: another call may have won meanwhile
      lockWatch = store.lockService.watch(journalKey).subscribe((incoming) => {
        const now = new Set(incoming.map((l) => l.entityKey));
        // a lock document that vanished was released (deleted) by its holder
        const gone = [...watched].filter((k) => !now.has(k)).flatMap((k) => {
          const held = store.locks()[k];
          return held ? [{ ...held, until: 0 }] : [];
        });
        watched = now;
        patchState(store, { locks: mergeLocks(store.locks(), [...gone, ...incoming]) });
      });
    }

    /** P2P for the active journal while the app is in the foreground (spec §5.4). */
    async function startPeers(): Promise<void> {
      const journalKey = store.activeJournalKey();
      if (!store.native() || !store.ready() || !journalKey) return;
      await store.peerService.start({
        journalKey,
        displayName: store.author()?.name || 'iPad',
        changes: () => store.changes(),
        photoFiles: () => allPhotoFiles(imagesOf(store.journalState(), journalKey)),
        onRecordsStored: reload,
        onPhotosStored: () => store.fileUrl.refresh(),
        onLock: receiveLock,
      }).catch(() => undefined);
    }

    let autoSync = false;
    function startAutoSync(): void {
      if (autoSync) return;
      autoSync = true;
      void Network.addListener('networkStatusChange', (status) => { if (status.connected) {
          void syncNow();
          const key = store.activeJournalKey();
          if (key) void startLockWatch(key); // a journal opened offline gets its watch now
        }
      });
      // iOS runs the peer link only in the foreground: stop it in the background, start it again on return
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void startPeers();
          void syncNow();
        } else void store.peerService.stop();
      });
      void startPeers();
      setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
      void syncNow();
    }

    /** The overview's map layers: downloaded areas from local files, the rest live where allowed. */
    function mapLayersFor(journalKey: string): JournalTileSource[] {
      const map = store.offlineMaps()[journalKey] ?? NO_OFFLINE_MAP;
      // a download stopped early must not swap the map for mostly missing tiles
      const usable = map.state === 'ready' || (map.state === 'partial' && map.failed <= map.total * 0.1);
      const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
      return mapLayers(areas, new Set(usable ? map.areaIds : []), store.fileUrl.dirUrl('tiles'));
    }

    /** Landing sites of the journal's map presets, as named points on the map. */
    function mapPlacesFor(journalKey: string): MapPlace[] {
      return mapPlaces(parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']));
    }

    /** Online: reads the minimum app version for writes and caches it. Offline the cached value stays. Never throws. */
    async function refreshWriteMinVersion(): Promise<void> {
      try {
        if (!(await Network.getStatus()).connected) return;
        const snap = await getDoc(doc(store.firestore, 'app-version', 'app-version'));
        const value = (snap.data() as AppVersionConfig | undefined)?.journalWriteMinVersion;
        const minVersion = typeof value === 'string' ? value : '';
        if (store.native()) await store.db.setMeta(META_WRITE_MIN_VERSION, minVersion); // SQLite is native-only
        patchState(store, { writeMinVersion: minVersion });
      } catch (error) {
        console.error('journal: reading the minimum write version failed', error);
      }
    }

    let cancelMap = false;

    // one shared load: a second page instance must not replace state that a write already extended
    let loading: Promise<void> | undefined;

    /**
     * The printed author names of the book (ruling R13), one source for the preview and the export request: the
     * journal's author list, and the signed-in person when they are not on it (yet). Names longer than the callable
     * accepts are shortened; an author without a name maps to '' (the book prints no name line then).
     */
    function bookAuthorNames(journalKey: string): Record<string, string> {
      const view = viewOf(store.journalState()[entityStateKey('journal', journalKey)]);
      const authors = Array.isArray(view?.['authors']) ? (view['authors'] as AvatarInfo[]) : [];
      const clip = (s: string) => (s.length > BOOK_LABEL_MAX ? s.slice(0, BOOK_LABEL_MAX - 1) + '…' : s);
      const out: Record<string, string> = {};
      for (const a of authors) if (a?.key) out[a.key] = clip(`${a.name1 ?? ''} ${a.name2 ?? ''}`.trim() || (a.label ?? ''));
      const me = store.appStore.currentPerson();
      const myKey = store.appStore.currentUser()?.personKey;
      if (me && myKey && out[myKey] === undefined) out[myKey] = clip(`${me.firstName} ${me.lastName}`.trim());
      return out;
    }

    return {
      init(): Promise<void> {
        loading ??= (async () => {
          if (!store.native()) {
            patchState(store, { ready: true });
            void refreshWriteMinVersion(); // the browser has no cache: below the minimum it reads but does not write
            return;
          }
          try {
            await store.identity.init();
            patchState(store, {
              changes: await store.db.listChanges(), ready: true, error: '',
              photoMode: parsePhotoMode(await store.db.getMeta(META_PHOTO_MODE), await store.db.getMeta(META_PHOTOS_PAUSED)),
              activeJournalKey: (await store.db.getMeta(META_ACTIVE_JOURNAL)) ?? '',
              writeMinVersion: (await store.db.getMeta(META_WRITE_MIN_VERSION)) ?? '',

            });
            const offlineMaps: Record<string, OfflineMapStatus> = {};
            for (const journal of journalsOf(store.journalState())) {
              offlineMaps[journal.key] = parseOfflineMap(await store.db.getMeta(META_OFFLINE_MAP + journal.key));
            }
            patchState(store, { offlineMaps });
            startAutoSync();
            void refreshWriteMinVersion(); // fire and forget: never blocks startup
            if (store.activeJournalKey()) void startLockWatch(store.activeJournalKey());
          } catch (error) {
            loading = undefined; // allow a retry
            patchState(store, { ready: true, error: String(error) });
          }
        })();
        return loading;
      },

      syncNow,

      /**
       * The web view for authors (plan 8): the journals this person writes in, loaded from Firestore and merged
       * like on the iPad. Read-only — writing stays on the iPad (spec §9.5).
       */
      /**
       * The web view for authors (plan 8): the journals this person writes in, live from Firestore — a footprint the
       * iPad publishes, or a photo it uploads later, appears without a reload. Started once per person; `stopWeb()`
       * on logout. Photo links that were missing or are about to expire are asked for again on every change and once
       * a minute (`JournalFileUrlService.refreshWeb`).
       */
      loadWeb(personKey: string): void {
        if (store.native() || (stopWeb && webPersonKey === personKey)) return;
        stopWebView();
        webPersonKey = personKey;
        stopWeb = store.syncService.watchRemoteJournals(
          personKey,
          (snapshot) => {
            // own writes not yet in the snapshot stay visible until Firestore confirms them
            const merged = mergePending(snapshot, pending);
            pending = merged.pending;
            patchState(store, { changes: merged.changes, ready: true, error: '', webLoaded: true });
            store.webWriter.receiveClocks(snapshot.map((c) => c.hlc));
            store.fileUrl.refreshWeb();
          },
          (error) => patchState(store, { ready: true, error: String(error), webLoaded: true }),
        );
        webRefresh = setInterval(() => store.fileUrl.refreshWeb(), 60_000);
      },

      /** Stops the live web view (logout, or another person signs in). */
      stopWeb(): void {
        stopWebView();
      },

      /**
       * «Druck-PDF erstellen» / «Bildschirm-PDF» on the book page (browser only): draws and uploads the book maps that
       * are not in the bucket yet, then runs the exportJournalBook function. Progress of the PDF itself is in the book
       * document (`export`); this status covers the maps and the call. Only one export at a time.
       */
      async exportBook(journalKey: string, kind: 'print' | 'screen'): Promise<BookExportStatus> {
        const tenantId = store.appStore.tenantId();
        const running = store.bookExport();
        if (store.native() || !tenantId || running.phase === 'maps' || running.phase === 'pdf') return running;
        const setStatus = (status: BookExportStatus) => { patchState(store, { bookExport: status }); return status; };
        const transport = Object.fromEntries(TRANSPORT_MODES.map((m) => [m, store.i18n[`transport_${m}`]()])) as Record<TransportMode, string>;
        const layers = mapLayersFor(journalKey);
        const labels = bookLabelsOf(store.bookI18n, transport, layers.filter((l) => l.kind !== 'vector').map((l) => l.attribution));
        const authorNames = bookAuthorNames(journalKey);
        return store.bookExporter.run({ journalKey, kind, state: store.journalState(), layers, labels, authorNames }, setStatus);
      },

      /** Comments of a footprint (plan 7), oldest first — from the log, so offline too. */
      comments(footprintKey: string): CommentView[] {
        return commentsOf(store.journalState(), footprintKey);
      },

      /** Who likes a footprint (person keys). */
      likes(footprintKey: string): string[] {
        return likesOf(store.journalState(), footprintKey);
      },

      async addComment(footprintKey: string, text: string): Promise<void> {
        const fp = footprint(footprintKey);
        const me = store.author();
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        if (!me) throw new JournalWriteRefused('noAuthor');
        await write([{
          journalKey: fp.journalKey, entity: 'comment', entityKey: crypto.randomUUID(), op: 'create',
          fields: { footprintKey, text: text.trim(), authorName: me.name, createdAt: new Date().toISOString() },
        }]);
      },

      /** Deletes one's own comment (owned entity: another author's archive would not count anyway). */
      async archiveComment(commentKey: string): Promise<void> {
        const comment = viewOf(store.journalState()[entityStateKey('comment', commentKey)]);
        const fp = typeof comment?.['footprintKey'] === 'string' ? footprint(comment['footprintKey']) : undefined;
        if (!fp) return;
        if (store.journalState()[entityStateKey('comment', commentKey)]?.ownerKey !== store.author()?.personKey) {
          throw new JournalWriteRefused('notOwner');
        }
        await write([{ journalKey: fp.journalKey, entity: 'comment', entityKey: commentKey, op: 'archive', fields: {} }]);
      },

      async toggleLike(footprintKey: string): Promise<void> {
        const fp = footprint(footprintKey);
        const me = store.author();
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        if (!me) throw new JournalWriteRefused('noAuthor');
        const liked = likesOf(store.journalState(), footprintKey).includes(me.personKey);
        await write([liked
          ? { journalKey: fp.journalKey, entity: 'reaction', entityKey: likeKey(footprintKey, me.personKey), op: 'archive', fields: {} }
          : { journalKey: fp.journalKey, entity: 'reaction', entityKey: likeKey(footprintKey, me.personKey), op: 'create',
            fields: { footprintKey, type: 'like', createdAt: new Date().toISOString() } }]);
      },

      /** The journal's guests as recorded on the journal (`guests: { person }[]`). */
      guests(journalKey: string): AvatarInfo[] {
        const view = viewOf(store.journalState()[entityStateKey('journal', journalKey)]);
        return (Array.isArray(view?.['guests']) ? (view['guests'] as { person?: AvatarInfo }[]) : [])
          .map((g) => g.person).filter((p): p is AvatarInfo => !!p && typeof p.key === 'string');
      },

      /** Adds a guest to the journal (a journal record); the link itself comes from manageJournalGuest. */
      async addGuest(journalKey: string, person: AvatarInfo): Promise<void> {
        const view = viewOf(store.journalState()[entityStateKey('journal', journalKey)]);
        const current = Array.isArray(view?.['guests']) ? (view['guests'] as { person: AvatarInfo }[]) : [];
        if (current.some((g) => g.person?.key === person.key)) return;
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { guests: [...current, { person }] } }]);
        void syncNow();
      },

      async removeGuest(journalKey: string, personKey: string): Promise<void> {
        const view = viewOf(store.journalState()[entityStateKey('journal', journalKey)]);
        const current = Array.isArray(view?.['guests']) ? (view['guests'] as { person: AvatarInfo }[]) : [];
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { guests: current.filter((g) => g.person?.key !== personKey) } }]);
        void syncNow();
      },

      /** The journal's map areas (plan 6b), from the journal field `mapAreas`. */
      mapAreas(journalKey: string): MapArea[] {
        return parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
      },

      offlineMap(journalKey: string): OfflineMapStatus {
        return store.offlineMaps()[journalKey] ?? NO_OFFLINE_MAP;
      },

      mapLayersFor,
      mapPlacesFor,

      async addMapArea(journalKey: string, area: MapArea): Promise<void> {
        const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
        if (areas.some((a) => a.id === area.id)) return;
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { mapAreas: [...areas, area] } }]);
      },

      async removeMapArea(journalKey: string, areaId: string): Promise<void> {
        const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { mapAreas: areas.filter((a) => a.id !== areaId) } }]);
      },

      /**
       * Downloads a journal's offline map (plans 6, 6b): its areas, the world background and — for the
       * Antarctica preset — detail around the journal's footprints. Raster tiles come natively, OpenStreetMap
       * tiles from the Protomaps build; tiles already on the iPad are skipped, so it resumes after a stop.
       */
      async downloadOfflineMap(journalKey: string): Promise<void> {
        const current = store.offlineMaps()[journalKey] ?? NO_OFFLINE_MAP;
        if (!store.native() || current.state === 'loading' || Object.values(store.offlineMaps()).some((m) => m.state === 'loading')) return;
        const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
        if (areas.length === 0) return;
        const positions = footprintsOf(store.journalState(), journalKey)
          .filter((f) => f.latitude !== undefined && f.longitude !== undefined)
          .map((f) => ({ lat: f.latitude as number, lng: f.longitude as number }));
        const setStatus = (status: OfflineMapStatus) => patchState(store, { offlineMaps: { ...store.offlineMaps(), [journalKey]: status } });
        const jobs = journalTilePlan(areas, positions);
        cancelMap = false;
        let done = 0;
        let failed = 0;
        setStatus({ ...current, state: 'loading', done: 0, total: jobs.length, failed: 0 });

        // tiles already on the iPad count as done without a request
        const todo: TileJob[] = [];
        for (let i = 0; i < jobs.length && !cancelMap; i += PRESENT_CHUNK) {
          const chunk = jobs.slice(i, i + PRESENT_CHUNK);
          const present = new Set((await JournalPhotos.presentTiles({ paths: chunk.map((j) => j.path) })).paths);
          for (const job of chunk) if (present.has(job.path)) done += 1; else todo.push(job);
          setStatus({ ...current, state: 'loading', done, total: jobs.length, failed });
        }

        let osm: Promise<OsmExtract> | undefined;
        let next = 0;
        const worker = async (): Promise<void> => {
          while (!cancelMap && next < todo.length) {
            const job = todo[next++];
            try {
              if (job.source === 'osm') {
                osm ??= OsmExtract.open();
                const tile = await (await osm).tile(job.z, job.x, job.y);
                if (tile) await JournalPhotos.writeTile({ path: job.path, data: toBase64(tile) });
              } else {
                await JournalPhotos.downloadTile({ url: job.url, path: job.path });
              }
            } catch {
              failed += 1; // open sea outside the LIMA mosaic, a timeout: retried on «Fortsetzen»
            }
            done += 1;
            setStatus({ ...current, state: 'loading', done, total: jobs.length, failed });
          }
        };
        await Promise.all(Array.from({ length: MAP_WORKERS }, () => worker()));
        const result: OfflineMapStatus = {
          state: failed === 0 && done === jobs.length ? 'ready' : 'partial', done, total: jobs.length, failed: failed + (jobs.length - done),
          at: new Date().toISOString(), areaIds: areas.map((a) => a.id),
        };
        setStatus(result);
        await store.db.setMeta(META_OFFLINE_MAP + journalKey, JSON.stringify(result));
      },

      /**
       * «Offline-Karte löschen» (plan 8): deletes this journal's tiles that no other journal on this iPad needs
       * and forgets its download state; the areas stay, so «Laden» brings the map back.
       */
      async freeOfflineMap(journalKey: string): Promise<number> {
        if (!store.native()) return 0;
        const plan = (key: string) => {
          const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', key)])?.['mapAreas']);
          const positions = footprintsOf(store.journalState(), key)
            .filter((f) => f.latitude !== undefined && f.longitude !== undefined)
            .map((f) => ({ lat: f.latitude as number, lng: f.longitude as number }));
          return areas.length > 0 ? journalTilePlan(areas, positions) : [];
        };
        const others = journalsOf(store.journalState()).filter((j) => j.key !== journalKey).flatMap((j) => plan(j.key));
        const paths = tilesToFree(plan(journalKey), others);
        let deleted = 0;
        for (let i = 0; i < paths.length; i += 500) {
          deleted += (await JournalPhotos.deleteTiles({ paths: paths.slice(i, i + 500) })).deleted;
        }
        patchState(store, { offlineMaps: { ...store.offlineMaps(), [journalKey]: NO_OFFLINE_MAP } });
        await store.db.setMeta(META_OFFLINE_MAP + journalKey, JSON.stringify(NO_OFFLINE_MAP));
        return deleted;
      },

      cancelOfflineMap(): void {
        cancelMap = true;
      },

      /**
       * «Fotos fürs Buch hochladen» (book export): exports this author's photos of the book from the iPad's own Photos
       * library in print size, uploads them and records each one in `prints` (targeted write, so the other author's
       * entries are untouched). Photos already in `prints` are skipped, so a stopped run resumes where it ended.
       */
      async uploadBookPrints(journalKey: string): Promise<BookPrintStatus> {
        const author = store.author();
        const tenantId = store.appStore.tenantId();
        if (!store.native() || !author || !tenantId || store.bookPrints().state === 'running') return store.bookPrints();
        const setStatus = (status: BookPrintStatus) => { patchState(store, { bookPrints: status }); return status; };
        // 'running' is set before the first await, so a second tap cannot start a second run
        let status: BookPrintStatus = setStatus({ ...NO_BOOK_PRINTS, state: 'running', journalKey });
        let candidates: ImageView[];
        try {
          if (!(await Network.getStatus()).connected) return setStatus({ ...NO_BOOK_PRINTS, state: 'offline', journalKey });
          const book = (await firstValueFrom(store.bookService.book$(journalKey))) ?? new JournalBookModel();
          candidates = bookPrintCandidates(store.journalState(), journalKey, book, author.personKey);
        } catch (error) {
          setStatus(NO_BOOK_PRINTS); // never stay at 'running'
          throw error;
        }
        status = setStatus({ ...status, total: candidates.length });
        try {
          for (const chunk of pagesOf(candidates, PRINT_CHUNK)) {
            const exported = new Map<string, { imageKey: string; size: { width: number; height: number } }>(); // by file
            for (const image of chunk) {
              const file = printFileOf(image.key);
              const result = await JournalPhotos.exportOriginal({
                journalKey, localIdentifier: image.localIdentifier, file, fillLongPx: PRINT_FILL_LONG_PX, fillShortPx: PRINT_FILL_SHORT_PX,
              });
              if ('skipped' in result) {
                const missing = result.skipped === 'notAccessible' || result.skipped === 'notOnDevice';
                status = setStatus({ ...status, done: status.done + 1, missing: status.missing + (missing ? 1 : 0), failed: status.failed + (missing ? 0 : 1) });
              } else {
                exported.set(file, { imageKey: image.key, size: result });
              }
            }
            const stored = new Set(exported.size > 0 ? await store.syncService.uploadPrintFiles(journalKey, [...exported.keys()]) : []);
            for (const [file, { imageKey, size }] of exported) {
              let ok = stored.has(file);
              if (ok) {
                try {
                  await store.bookService.setPrint(journalKey, tenantId, imageKey, size, author.personKey);
                } catch {
                  ok = false; // the file is up, but the book does not know it yet: next run finds it and records it
                }
              }
              await JournalPhotos.deleteFile({ journalKey, file }).catch(() => undefined); // never keep print files on the iPad
              status = setStatus({ ...status, done: status.done + 1, uploaded: status.uploaded + (ok ? 1 : 0), failed: status.failed + (ok ? 0 : 1) });
            }
          }
        } catch {
          // a callable or plugin failure ends the run; what was recorded stays, the rest is counted as failed
          status = { ...status, failed: status.failed + (status.total - status.done), done: status.total };
        }
        return setStatus({ ...status, state: 'done' });
      },

      /** The journal now open becomes the active one: P2P switches to it. */
      async openJournal(journalKey: string): Promise<void> {
        await loading;
        if (!store.native()) {
          // browser: no SQLite meta, no peers — only the edit locks of this journal
          patchState(store, { activeJournalKey: journalKey });
          await startLockWatch(journalKey);
          return;
        }
        if (store.activeJournalKey() === journalKey) {
          await startLockWatch(journalKey); // restored at startup, or opened offline before
          return;
        }
        patchState(store, { activeJournalKey: journalKey });
        await store.db.setMeta(META_ACTIVE_JOURNAL, journalKey);
        await startPeers();
        await startLockWatch(journalKey);
      },

      /**
       * Takes the edit lock on a block or footprint. Returns the other person's live lock when refused,
       * otherwise locks it for this author and keeps renewing it until `releaseLock`.
       */
      async acquireLock(journalKey: string, entityKey: string): Promise<JournalLock | undefined> {
        const me = store.author();
        if (!me) return undefined;
        const other = lockedBy(store.locks(), entityKey, me.personKey, Date.now());
        if (other) return other;
        const renew = (): void =>
          publishLock({ journalKey, entityKey, personKey: me.personKey, name: me.name, until: Date.now() + LOCK_TTL_MS });
        clearInterval(heartbeats.get(entityKey));
        heartbeats.set(entityKey, setInterval(() => renew(), LOCK_HEARTBEAT_MS));
        renew();
        return undefined;
      },

      async releaseLock(journalKey: string, entityKey: string): Promise<void> {
        const me = store.author();
        clearInterval(heartbeats.get(entityKey));
        heartbeats.delete(entityKey);
        if (!me) return;
        const held = store.locks()[entityKey];
        if (held && held.personKey !== me.personKey) return; // never clear someone else's lock
        const lock: JournalLock = { journalKey, entityKey, personKey: me.personKey, name: me.name, until: 0 };
        patchState(store, { locks: mergeLocks(store.locks(), [lock]) });
        store.peerService.pushLock(lock);
        void Network.getStatus().then((n) => n.connected && void store.lockService.release(journalKey, entityKey));
      },

      /** The live lock another person holds on this entity, else undefined (re-evaluated every 15 s). */
      lockOf(entityKey: string): JournalLock | undefined {
        store.lockClock();
        const me = store.author()?.personKey ?? '';
        return lockedBy(store.locks(), entityKey, me, Date.now());
      },

      async setPhotoMode(mode: JournalPhotoMode): Promise<void> {
        await store.db.setMeta(META_PHOTO_MODE, mode);
        patchState(store, { photoMode: mode });
        if (mode !== 'paused') void syncNow();
      },

      /** The journal's co-authors as recorded on the journal (empty until someone was added). */
      authors(journalKey: string): AvatarInfo[] {
        const view = viewOf(store.journalState()[entityStateKey('journal', journalKey)]);
        return Array.isArray(view?.['authors']) ? (view['authors'] as AvatarInfo[]) : [];
      },

      /** The printed author names of the book (ruling R13), one source for the preview and the export request. */
      bookAuthorNames,

      /**
       * Adds a co-author (plan 4): a journal record with the full author list. The function derives the
       * journal's authorKeys from it; the creator always stays an author.
       */
      async addCoAuthor(journalKey: string, person: AvatarInfo): Promise<void> {
        const me = store.author();
        if (!me) throw new JournalWriteRefused('noAuthor');
        const entity = store.journalState()[entityStateKey('journal', journalKey)];
        const view = viewOf(entity);
        const current = Array.isArray(view?.['authors']) ? (view['authors'] as AvatarInfo[]) : [];
        const self: AvatarInfo = { key: me.personKey, name1: me.name, name2: '', modelType: 'person', type: '', subType: '', label: me.name };
        const byKey = new Map<string, AvatarInfo>([[self.key, self], ...current.map((a) => [a.key, a] as [string, AvatarInfo]), [person.key, person]]);
        const authors = [...byKey.values()];
        const authorKeys = [...new Set([...(entity?.ownerKey ? [entity.ownerKey] : []), ...authors.map((a) => a.key)])];
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { authors, authorKeys } }]);
        void syncNow();
      },

      footprints(journalKey: string): FootprintView[] {
        return footprintsOf(store.journalState(), journalKey);
      },

      footprint,

      images(journalKey: string): Map<string, ImageView> {
        return imagesOf(store.journalState(), journalKey);
      },

      /** `key`: the caller may choose it, so a slow browser write (records kept) still knows the new journal. */
      async createJournal(title: string, key: string = crypto.randomUUID()): Promise<string> {
        await write([{ journalKey: key, entity: 'journal', entityKey: key, op: 'create', fields: { title, subTitle: '', startDate: '', endDate: '' } }]);
        return key;
      },

      /** `key`: as in createJournal. */
      async addFootprint(journalKey: string, title: string, key: string = crypto.randomUUID()): Promise<string> {
        await write([{
          journalKey, entity: 'footprint', entityKey: key, op: 'create',
          fields: { journalKey, title, placeName: '', date: '', time: '', publishState: 'draft' },
        }]);
        return key;
      },

      async setFootprint(footprintKey: string, fields: FootprintFields): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: { ...fields }, bases: basesOf(fp.hlcs, fields, CONFLICT_FIELDS['footprint'] ?? []) }]);
      },

      /**
       * Saves the footprint modal's form model (title, place, date, time, publish state). `opened` is the
       * footprint as the modal showed it: only fields the user changed against it are written, based on its
       * hlcs — an edit delivered while the modal was open is neither overwritten unseen nor counted as seen.
       * Without it (a footprint just created) the current state is the baseline.
       */
      async saveFootprintForm(footprintKey: string, model: FootprintFormModel, opened?: FootprintView): Promise<void> {
        const current = footprint(footprintKey);
        if (!current) throw new Error(`unknown footprint ${footprintKey}`);
        const fp = opened ?? current;
        const fields: FootprintFields = {};
        if (model.title !== fp.title) fields.title = model.title;
        if (model.placeName !== fp.placeName) fields.placeName = model.placeName;
        if (model.date !== fp.date) fields.date = model.date;
        if (model.time !== fp.time) fields.time = model.time;
        if (model.transport !== (fp.transport ?? '')) fields.transport = model.transport;
        const publishState = model.published ? 'published' : 'draft';
        if (publishState !== fp.publishState) fields.publishState = publishState;
        if (Object.keys(fields).length === 0) return;
        await write([{ journalKey: current.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: { ...fields }, bases: basesOf(fp.hlcs, fields, CONFLICT_FIELDS['footprint'] ?? []) }]);
      },

      /** Puts the blocks of a footprint into the order of `keys`; only the blocks that must move get a new key. */
      async reorderBlocks(footprintKey: string, keys: string[]): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const changed = reorderedOrders(fp.blocks, keys);
        const drafts: ChangeDraft[] = Object.entries(changed).map(([key, order]) => ({
          journalKey: fp.journalKey, entity: 'section', entityKey: key, op: 'set', fields: { order },
        }));
        if (drafts.length > 0) await write(drafts);
      },

      /** Dismisses the reminder about a lost footprint value (identified by the hlc of the lost record). */
      async dismissFootprintConflict(footprintKey: string, hlc: string): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        await write([{
          journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set',
          fields: { [dismissedField(hlc)]: true },
        }]);
      },

      async addTextBlock(footprintKey: string, html: string): Promise<string> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const key = crypto.randomUUID();
        await write([{
          journalKey: fp.journalKey, entity: 'section', entityKey: key, op: 'create',
          fields: { footprintKey, kind: 'text', html, order: orderBetween(lastBlockOrder(fp), undefined) },
        }]);
        return key;
      },

      /**
       * `seen` (here and in the photo methods) = the block's hlcs when the editor or action sheet opened; a
       * value delivered after that was not seen and must stay a conflict. Without it the current block counts.
       */
      async updateTextBlock(blockKey: string, html: string, seen?: Record<string, string>): Promise<void> {
        const { journalKey, block } = blockOf(blockKey);
        const fields = { html };
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields, bases: basesOf(seen ?? block.hlcs, fields, CONFLICT_FIELDS['section'] ?? []) }]);
      },

      /** Adds photos to an existing photo block (any author's). */
      async addPhotosToBlock(blockKey: string, seen?: Record<string, string>, files?: File[] | Promise<File[]>): Promise<{ added: number; skipped: SkippedPhoto[] }> {
        const { journalKey, block } = blockOf(blockKey);
        const { drafts, imageKeys, photos, skipped } = await pickImages(journalKey, files);
        if (photos.length === 0) return { added: 0, skipped };
        const fields = { imageKeys: [...(block.imageKeys ?? []), ...imageKeys] };
        drafts.push({ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields, bases: basesOf(seen ?? block.hlcs, fields, CONFLICT_FIELDS['section'] ?? []) });
        await writePhotos(journalKey, drafts, photos);
        return { added: photos.length, skipped };
      },

      /** Removes one photo from a photo block; the image record stays (other blocks may not use it). */
      async removePhotoFromBlock(blockKey: string, imageKey: string, seen?: Record<string, string>): Promise<void> {
        const { journalKey, block } = blockOf(blockKey);
        const fields = { imageKeys: (block.imageKeys ?? []).filter((k) => k !== imageKey) };
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields, bases: basesOf(seen ?? block.hlcs, fields, CONFLICT_FIELDS['section'] ?? []) }]);
      },

      /** Deletes (archives) a footprint; footprints are shared, so either author may. */
      async archiveFootprint(footprintKey: string): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const me = store.author()?.personKey;
        if (!me) throw new JournalWriteRefused('noAuthor');
        if (hasOthersBlocks([fp], me)) throw new JournalWriteRefused('othersContent');
        await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'archive', fields: {} }]);
      },

      async renameJournal(journalKey: string, title: string): Promise<void> {
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { title } }]);
      },

      /** Deletes (archives) a whole journal; its footprints disappear with it from every list. */
      async archiveJournal(journalKey: string): Promise<void> {
        const me = store.author()?.personKey;
        if (!me) throw new JournalWriteRefused('noAuthor');
        if (hasOthersBlocks(footprintsOf(store.journalState(), journalKey), me)) throw new JournalWriteRefused('othersContent');
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'archive', fields: {} }]);
      },

      async archiveBlock(blockKey: string): Promise<void> {
        const { journalKey } = blockOf(blockKey);
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'archive', fields: {} }]);
      },

      /**
       * Picks photos, stores one image record per imported photo plus one photo block — all in one
       * transaction. A footprint without date or position takes them from the photos (ship time).
       */
      async addPhotoBlock(journalKey: string, footprintKey: string, files?: File[] | Promise<File[]>): Promise<{ added: number; skipped: SkippedPhoto[] }> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const { drafts, imageKeys, photos, skipped } = await pickImages(journalKey, files);
        if (photos.length === 0) return { added: 0, skipped };
        drafts.push({
          journalKey, entity: 'section', entityKey: crypto.randomUUID(), op: 'create',
          fields: { footprintKey, kind: 'photos', imageKeys, order: orderBetween(lastBlockOrder(fp), undefined) },
        });

        const fill: Record<string, unknown> = {};
        const position = footprintPosition(photos);
        if (fp.latitude === undefined && position) Object.assign(fill, position);
        // only well-formed capture times count: one malformed value must not hide the valid ones
        const earliest = photos.map((p) => p.takenAt).filter((t): t is string => !!t && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)).sort()[0];
        if (!fp.date && earliest) {
          const date = convertDateFormatToString(earliest, DateFormat.IsoDateTime, DateFormat.StoreDate, false);
          const time = convertDateFormatToString(earliest, DateFormat.IsoDateTime, DateFormat.Time, false);
          if (date) fill['date'] = date;
          if (time) fill['time'] = time;
        }
        if (Object.keys(fill).length > 0) {
          drafts.push({ journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: fill, bases: basesOf(fp.hlcs, fill, CONFLICT_FIELDS['footprint'] ?? []) });
        }
        await writePhotos(journalKey, drafts, photos);
        return { added: photos.length, skipped };
      },
    };
  }),
  withHooks((store) => ({
    onInit(): void {
      // Bind the author whenever a signed-in user with a person is known (online). Offline the binding
      // stored in SQLite is used — AppStore has no user after an offline cold start on iOS.
      effect(() => {
        const user = store.appStore.currentUser();
        const person = store.appStore.currentPerson();
        if (!user?.personKey) {
          untracked(() => store.stopWeb());
          return;
        }
        if (!store.native()) {
          untracked(() => store.loadWeb(user.personKey));
          return;
        }
        const name = person ? `${person.firstName} ${person.lastName}`.trim() : '';
        untracked(() => void store.identity.bindAuthor({ personKey: user.personKey, name }).catch(() => undefined));
      });
    },
  })),
);
