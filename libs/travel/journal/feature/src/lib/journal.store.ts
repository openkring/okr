import { computed, effect, inject, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { JournalChange } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { ChangeDraft, JournalDb, JournalIdentityService, JournalPhotos, SkippedPhoto } from '@okr/travel-journal-data-access';
import {
  entityStateKey, FootprintFormModel, JOURNAL_I18N_KEYS, JournalI18n, FootprintView, footprintPosition, footprintsOf, ImageView, imagesOf, JournalState,
  journalsOf, JournalWriteRefused, lastBlockOrder, materialize, orderBetween, viewOf,
} from '@okr/travel-journal-util';

/**
 * The travel journal on this device (spec 1.113, plan 2). Reads and writes only SQLite through
 * JournalDb / JournalIdentityService — no Firestore, no app-config — so it works after an offline
 * cold start. Every action becomes change records; the in-memory state is updated only after the
 * database write succeeded.
 */
export type FootprintFields = Partial<Pick<FootprintView, 'title' | 'placeName' | 'date' | 'time' | 'latitude' | 'longitude' | 'publishState'>>;

interface JournalStoreState {
  ready: boolean;
  native: boolean;
  error: string;
  changes: JournalChange[];
}

const initialState: JournalStoreState = { ready: false, native: Capacitor.isNativePlatform(), error: '', changes: [] };

export const JournalStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    db: inject(JournalDb),
    identity: inject(JournalIdentityService),
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
    };
  }),
  withMethods((store) => {
    /** Stamps and stores the drafts, then applies them in memory. */
    async function write(drafts: ChangeDraft[]): Promise<JournalChange[]> {
      const changes = await store.identity.stampChanges(drafts);
      patchState(store, { changes: [...store.changes(), ...changes] });
      return changes;
    }

    function footprint(footprintKey: string): FootprintView | undefined {
      const view = viewOf(store.journalState()[entityStateKey('footprint', footprintKey)]);
      const journalKey = typeof view?.['journalKey'] === 'string' ? view['journalKey'] : undefined;
      return journalKey ? footprintsOf(store.journalState(), journalKey).find((f) => f.key === footprintKey) : undefined;
    }

    function ownBlock(blockKey: string): { footprint: FootprintView; journalKey: string } {
      const section = viewOf(store.journalState()[entityStateKey('section', blockKey)]);
      const fp = typeof section?.['footprintKey'] === 'string' ? footprint(section['footprintKey']) : undefined;
      const block = fp?.blocks.find((b) => b.key === blockKey);
      if (!fp || !block) throw new Error(`unknown block ${blockKey}`);
      if (block.authorKey !== store.identity.author()?.personKey) throw new JournalWriteRefused('notOwner');
      return { footprint: fp, journalKey: fp.journalKey };
    }

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
            patchState(store, { changes: await store.db.listChanges(), ready: true, error: '' });
          } catch (error) {
            loading = undefined; // allow a retry
            patchState(store, { ready: true, error: String(error) });
          }
        })();
        return loading;
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
        if (!store.identity.author()) throw new JournalWriteRefused('noAuthor'); // before the picker opens
        const { photos, skipped } = await JournalPhotos.pick({ journalKey });
        if (photos.length === 0) return { added: 0, skipped };

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
        drafts.push({
          journalKey, entity: 'section', entityKey: crypto.randomUUID(), op: 'create',
          fields: { footprintKey, kind: 'photos', imageKeys, order: orderBetween(lastBlockOrder(fp), undefined) },
        });

        const fill: Record<string, unknown> = {};
        const position = footprintPosition(photos.filter((p): p is typeof p & { takenAt: string } => !!p.takenAt));
        if (fp.latitude === undefined && position) Object.assign(fill, position);
        const earliest = photos.map((p) => p.takenAt).filter((t): t is string => !!t).sort()[0];
        if (!fp.date && earliest) {
          fill['date'] = convertDateFormatToString(earliest, DateFormat.IsoDateTime, DateFormat.StoreDate, false);
          fill['time'] = convertDateFormatToString(earliest, DateFormat.IsoDateTime, DateFormat.Time, false);
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
        if (!store.native || !user?.personKey) return;
        const name = person ? `${person.firstName} ${person.lastName}`.trim() : '';
        untracked(() => void store.identity.bindAuthor({ personKey: user.personKey, name }).catch(() => undefined));
      });
    },
  })),
);
