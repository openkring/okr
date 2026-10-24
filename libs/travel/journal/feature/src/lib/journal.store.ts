import { computed, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { AvatarInfo, JournalChange } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import {
  ChangeDraft, JournalDb, JournalIdentityService, JournalPeerService, JournalPhotos, JournalSyncService, OsmExtract, PickedPhoto, SkippedPhoto,
  toBase64,
} from '@okr/travel-journal-data-access';
import {
  entityStateKey, hasOthersBlocks, FootprintFormModel, JOURNAL_I18N_KEYS, JournalI18n, FootprintView, footprintPosition, footprintsOf, ImageView, imagesOf, JournalState,
  allPhotoFiles, commentsOf, CommentView, likeKey, likesOf, JournalPhotoMode, JournalTileSource, journalsOf, journalTilePlan, MapArea, mapLayers, parseMapAreas, parsePhotoMode, TileJob, tilesToFree, JournalWriteRefused, lastBlockOrder, materialize, orderBetween, publishedPhotoFiles, viewOf,
} from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';

const SYNC_INTERVAL_MS = 2 * 60 * 1000;
const META_PHOTO_MODE = 'photoMode';
const META_OFFLINE_MAP = 'offlineMap:'; // + journalKey
const MAP_WORKERS = 4; // parallel tile requests: polite to GIBS, the USGS WMS, swisstopo and Protomaps
const PRESENT_CHUNK = 200;
const META_ACTIVE_JOURNAL = 'activeJournal'; // the journal last opened: the one P2P runs for
const META_PHOTOS_PAUSED = 'photosPaused'; // before the three photo modes

/**
 * The travel journal on this device (spec 1.113, plan 2). Reads and writes only SQLite through
 * JournalDb / JournalIdentityService — no Firestore, no app-config — so it works after an offline
 * cold start. Every action becomes change records; the in-memory state is updated only after the
 * database write succeeded. Plan 4: JournalSyncService exchanges the records with Firebase when
 * online (on start, when the network returns and every two minutes); offline nothing changes.
 */
export type FootprintFields = Partial<Pick<FootprintView, 'title' | 'placeName' | 'date' | 'time' | 'latitude' | 'longitude' | 'publishState'>>;

interface JournalStoreState {
  ready: boolean;
  native: boolean;
  error: string;
  changes: JournalChange[];
  photoMode: JournalPhotoMode;
  activeJournalKey: string;
  offlineMaps: Record<string, OfflineMapStatus>; // per journal
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

const initialState: JournalStoreState = { ready: false, native: Capacitor.isNativePlatform(), error: '', changes: [], photoMode: 'all', activeJournalKey: '', offlineMaps: {} };

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
  })),
  withProps(() => ({
    i18n: inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n,
  })),
  withComputed((store) => {
    const journalState = computed<JournalState>(() => materialize(store.changes()));
    return {
      journalState,
      journals: computed(() => journalsOf(journalState())),
      author: computed(() => store.identity.author()),
      syncStatus: computed(() => store.syncService.status()),
      peerStatus: computed(() => store.peerService.status()),
    };
  }),
  withMethods((store) => {
    /** Stamps and stores the drafts, then applies them in memory. */
    async function write(drafts: ChangeDraft[]): Promise<JournalChange[]> {
      const changes = await store.identity.stampChanges(drafts);
      patchState(store, { changes: [...store.changes(), ...changes] });
      store.peerService.push(changes); // the other iPad, when connected, gets it at once
      return changes;
    }

    function footprint(footprintKey: string): FootprintView | undefined {
      const view = viewOf(store.journalState()[entityStateKey('footprint', footprintKey)]);
      const journalKey = typeof view?.['journalKey'] === 'string' ? view['journalKey'] : undefined;
      return journalKey ? footprintsOf(store.journalState(), journalKey).find((f) => f.key === footprintKey) : undefined;
    }

    /** Picks photos and builds one image record per imported photo (not yet written). */
    async function pickImages(journalKey: string): Promise<{ drafts: ChangeDraft[]; imageKeys: string[]; photos: PickedPhoto[]; skipped: SkippedPhoto[] }> {
      if (!store.identity.author()) throw new JournalWriteRefused('noAuthor'); // before the picker opens
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

    function ownBlock(blockKey: string): { footprint: FootprintView; journalKey: string } {
      const section = viewOf(store.journalState()[entityStateKey('section', blockKey)]);
      const fp = typeof section?.['footprintKey'] === 'string' ? footprint(section['footprintKey']) : undefined;
      const block = fp?.blocks.find((b) => b.key === blockKey);
      if (!fp || !block) throw new Error(`unknown block ${blockKey}`);
      if (block.authorKey !== store.identity.author()?.personKey) throw new JournalWriteRefused('notOwner');
      return { footprint: fp, journalKey: fp.journalKey };
    }

    /** Re-reads the log after a download; keeps records a write added meanwhile. */
    async function reload(): Promise<void> {
      const stored = await store.db.listChanges();
      const ids = new Set(stored.map((c) => c.id));
      patchState(store, { changes: [...stored, ...store.changes().filter((c) => !ids.has(c.id))] });
    }

    async function syncNow(): Promise<void> {
      const author = store.identity.author();
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
      if (fillingWeather || !store.identity.author()) return;
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

    /** P2P for the active journal while the app is in the foreground (spec §5.4). */
    async function startPeers(): Promise<void> {
      const journalKey = store.activeJournalKey();
      if (!store.native() || !store.ready() || !journalKey) return;
      await store.peerService.start({
        journalKey,
        displayName: store.identity.author()?.name || 'iPad',
        changes: () => store.changes(),
        photoFiles: () => allPhotoFiles(imagesOf(store.journalState(), journalKey)),
        onRecordsStored: reload,
        onPhotosStored: () => store.fileUrl.refresh(),
      }).catch(() => undefined);
    }

    let autoSync = false;
    function startAutoSync(): void {
      if (autoSync) return;
      autoSync = true;
      void Network.addListener('networkStatusChange', (status) => { if (status.connected) void syncNow(); });
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

    let cancelMap = false;

    // one shared load: a second page instance must not replace state that a write already extended
    let loading: Promise<void> | undefined;

    return {
      init(): Promise<void> {
        loading ??= (async () => {
          if (!store.native()) {
            patchState(store, { ready: true });
            return;
          }
          try {
            await store.identity.init();
            patchState(store, {
              changes: await store.db.listChanges(), ready: true, error: '',
              photoMode: parsePhotoMode(await store.db.getMeta(META_PHOTO_MODE), await store.db.getMeta(META_PHOTOS_PAUSED)),
              activeJournalKey: (await store.db.getMeta(META_ACTIVE_JOURNAL)) ?? '',

            });
            const offlineMaps: Record<string, OfflineMapStatus> = {};
            for (const journal of journalsOf(store.journalState())) {
              offlineMaps[journal.key] = parseOfflineMap(await store.db.getMeta(META_OFFLINE_MAP + journal.key));
            }
            patchState(store, { offlineMaps });
            startAutoSync();
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
      async loadWeb(personKey: string): Promise<void> {
        if (store.native()) return;
        try {
          patchState(store, { changes: await store.syncService.loadRemoteJournals(personKey), ready: true, error: '' });
        } catch (error) {
          patchState(store, { ready: true, error: String(error) });
        }
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
        const me = store.identity.author();
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
        if (store.journalState()[entityStateKey('comment', commentKey)]?.ownerKey !== store.identity.author()?.personKey) {
          throw new JournalWriteRefused('notOwner');
        }
        await write([{ journalKey: fp.journalKey, entity: 'comment', entityKey: commentKey, op: 'archive', fields: {} }]);
      },

      async toggleLike(footprintKey: string): Promise<void> {
        const fp = footprint(footprintKey);
        const me = store.identity.author();
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

      /** The overview's map layers: downloaded areas from local files, the rest live where allowed. */
      mapLayersFor(journalKey: string): JournalTileSource[] {
        const map = store.offlineMaps()[journalKey] ?? NO_OFFLINE_MAP;
        // a download stopped early must not swap the map for mostly missing tiles
        const usable = map.state === 'ready' || (map.state === 'partial' && map.failed <= map.total * 0.1);
        const areas = parseMapAreas(viewOf(store.journalState()[entityStateKey('journal', journalKey)])?.['mapAreas']);
        return mapLayers(areas, new Set(usable ? map.areaIds : []), store.fileUrl.dirUrl('tiles'));
      },

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

      /** The journal now open becomes the active one: P2P switches to it. */
      async openJournal(journalKey: string): Promise<void> {
        await loading;
        if (!store.native() || store.activeJournalKey() === journalKey) return;
        patchState(store, { activeJournalKey: journalKey });
        await store.db.setMeta(META_ACTIVE_JOURNAL, journalKey);
        await startPeers();
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

      /**
       * Adds a co-author (plan 4): a journal record with the full author list. The function derives the
       * journal's authorKeys from it; the creator always stays an author.
       */
      async addCoAuthor(journalKey: string, person: AvatarInfo): Promise<void> {
        const me = store.identity.author();
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

      async createJournal(title: string): Promise<string> {
        const key = crypto.randomUUID();
        await write([{ journalKey: key, entity: 'journal', entityKey: key, op: 'create', fields: { title, subTitle: '', startDate: '', endDate: '' } }]);
        return key;
      },

      async addFootprint(journalKey: string, title: string): Promise<string> {
        const key = crypto.randomUUID();
        await write([{
          journalKey, entity: 'footprint', entityKey: key, op: 'create',
          fields: { journalKey, title, placeName: '', date: '', time: '', publishState: 'draft' },
        }]);
        return key;
      },

      async setFootprint(footprintKey: string, fields: FootprintFields): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: { ...fields } }]);
      },

      /** Saves the footprint modal's form model (title, place, date, time, publish state). */
      async saveFootprintForm(footprintKey: string, model: FootprintFormModel): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const fields: FootprintFields = {};
        if (model.title !== fp.title) fields.title = model.title;
        if (model.placeName !== fp.placeName) fields.placeName = model.placeName;
        if (model.date !== fp.date) fields.date = model.date;
        if (model.time !== fp.time) fields.time = model.time;
        const publishState = model.published ? 'published' : 'draft';
        if (publishState !== fp.publishState) fields.publishState = publishState;
        if (Object.keys(fields).length === 0) return;
        await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: { ...fields } }]);
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

      async updateTextBlock(blockKey: string, html: string): Promise<void> {
        const { journalKey } = ownBlock(blockKey);
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields: { html } }]);
      },

      /** Adds photos to an existing photo block of this author. */
      async addPhotosToBlock(blockKey: string): Promise<{ added: number; skipped: SkippedPhoto[] }> {
        const { footprint: fp, journalKey } = ownBlock(blockKey);
        const block = fp.blocks.find((b) => b.key === blockKey);
        const { drafts, imageKeys, photos, skipped } = await pickImages(journalKey);
        if (photos.length === 0) return { added: 0, skipped };
        drafts.push({ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields: { imageKeys: [...(block?.imageKeys ?? []), ...imageKeys] } });
        await write(drafts);
        return { added: photos.length, skipped };
      },

      /** Removes one photo from a photo block of this author; the image record stays (other blocks may not use it). */
      async removePhotoFromBlock(blockKey: string, imageKey: string): Promise<void> {
        const { footprint: fp, journalKey } = ownBlock(blockKey);
        const block = fp.blocks.find((b) => b.key === blockKey);
        const imageKeys = (block?.imageKeys ?? []).filter((k) => k !== imageKey);
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'set', fields: { imageKeys } }]);
      },

      /** Deletes (archives) a footprint; footprints are shared, so either author may. */
      async archiveFootprint(footprintKey: string): Promise<void> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const me = store.identity.author()?.personKey;
        if (!me) throw new JournalWriteRefused('noAuthor');
        if (hasOthersBlocks([fp], me)) throw new JournalWriteRefused('othersContent');
        await write([{ journalKey: fp.journalKey, entity: 'footprint', entityKey: footprintKey, op: 'archive', fields: {} }]);
      },

      async renameJournal(journalKey: string, title: string): Promise<void> {
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'set', fields: { title } }]);
      },

      /** Deletes (archives) a whole journal; its footprints disappear with it from every list. */
      async archiveJournal(journalKey: string): Promise<void> {
        const me = store.identity.author()?.personKey;
        if (!me) throw new JournalWriteRefused('noAuthor');
        if (hasOthersBlocks(footprintsOf(store.journalState(), journalKey), me)) throw new JournalWriteRefused('othersContent');
        await write([{ journalKey, entity: 'journal', entityKey: journalKey, op: 'archive', fields: {} }]);
      },

      async archiveBlock(blockKey: string): Promise<void> {
        const { journalKey } = ownBlock(blockKey);
        await write([{ journalKey, entity: 'section', entityKey: blockKey, op: 'archive', fields: {} }]);
      },

      /**
       * Picks photos, stores one image record per imported photo plus one photo block — all in one
       * transaction. A footprint without date or position takes them from the photos (ship time).
       */
      async addPhotoBlock(journalKey: string, footprintKey: string): Promise<{ added: number; skipped: SkippedPhoto[] }> {
        const fp = footprint(footprintKey);
        if (!fp) throw new Error(`unknown footprint ${footprintKey}`);
        const { drafts, imageKeys, photos, skipped } = await pickImages(journalKey);
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
          drafts.push({ journalKey, entity: 'footprint', entityKey: footprintKey, op: 'set', fields: fill });
        }
        await write(drafts);
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
        if (!user?.personKey) return;
        if (!store.native()) {
          untracked(() => void store.loadWeb(user.personKey));
          return;
        }
        const name = person ? `${person.firstName} ${person.lastName}`.trim() : '';
        untracked(() => void store.identity.bindAuthor({ personKey: user.personKey, name }).catch(() => undefined));
      });
    },
  })),
);
