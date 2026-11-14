import { Injectable, inject, signal } from '@angular/core';
import { Network } from '@capacitor/network';
import { getApp } from 'firebase/app';
import {
  collection, doc, getDocFromServer, getDocsFromServer, limit, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ensureAppCheckToken, FIRESTORE } from '@okr/shared-config';
import { JournalChange, JournalChangeCollection, JournalCollection, TripModel } from '@okr/shared-models';
import {
  BoundAuthor, classifyUploadError, mergeOutboxJournals, nextBoundAuthor, OutboxDelivery, OutboxJournal, OutboxStamp, pagesOf, parseBoundAuthor,
  parseOutboxJournals, parseOutboxStamp, serializeBoundAuthor, serializeOutboxJournals, serializeOutboxStamp, stampDelivery, trackCopyOf, TrackCopyInput,
  trackDeliveryDrafts, trackKeyOf, trackPhotoPlan, UPLOAD_PAGE,
} from '@okr/travel-journal-util';

import { JournalOutboxDb } from './journal-outbox-db';
import { JournalPhotos } from './journal-photos.plugin';
import { importTrackPhotos } from './journal-track-photos';

/**
 * «An Reisetagebuch senden» on the iPhone (spec 1.154 phase 5, decision 9; 1.121 §8): builds a delivery — the photos of a
 * recorded track as journal images (2048/400 through PhotoKit, this phone took them) plus the derived `track` record —
 * stamps it with the phone's own identity and keeps it in the outbox until it has arrived. Online it is written to
 * `journal-changes` and the photo files go to the journal's Storage folder exactly as an iPad uploads them; offline
 * JournalOutboxPeer hands it to an iPad of the journal over the local network. The phone holds no journal database.
 */
export type OutboxSendResult =
  | { state: 'queued'; delivery: OutboxDelivery; skipped: number }
  | { state: 'pending' } // this trip waits for this journal already
  | { state: 'inJournal' }; // the journal holds this trip's track already (online check or sent before)

/** The network is gone (or a call timed out): the delivery stays in the outbox for P2P or a later online round. */
export class JournalOutboxOffline extends Error {
  public constructor(message = 'journal outbox: offline') {
    super(message);
    this.name = 'JournalOutboxOffline';
  }
}

const META_STAMP = 'stamp';
const META_AUTHOR = 'author';
const META_JOURNALS = 'journals';
const META_SENT = 'sent';
const CALL_TIMEOUT_MS = 20_000;
const PHOTO_CHUNK = 50; // prepareJournalPhotoUploads takes at most 50 files per call
const SENT_MAX = 500;

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code.replace(/^(firestore|functions)\//, '') : undefined;
}

const isOfflineError = (error: unknown): boolean =>
  error instanceof JournalOutboxOffline || ['unavailable', 'deadline-exceeded'].includes(errorCode(error) ?? '');

function withTimeout<T>(promise: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new JournalOutboxOffline('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e); });
  });
}

const sentKey = (journalKey: string, tripKey: string) => `${journalKey}|${tripKey}`;

@Injectable({ providedIn: 'root' })
export class JournalOutboxService {
  private readonly db = inject(JournalOutboxDb);
  private readonly firestore = inject(FIRESTORE);
  private readonly pendingSignal = signal<OutboxDelivery[]>([]);
  private queue: Promise<unknown> = Promise.resolve();
  private loaded?: Promise<void>;

  /** What still has to arrive somewhere (all journals), oldest first. */
  public readonly pending = this.pendingSignal.asReadonly();

  /** Reads the outbox once; later calls wait for the same read. */
  public load(): Promise<void> {
    this.loaded ??= this.db.deliveries().then((list) => this.pendingSignal.set(list)).catch((error: unknown) => {
      this.loaded = undefined;
      throw error;
    });
    return this.loaded;
  }

  /** The phone's base device id (created once); the P2P link announces it, every delivery derives its own id from it. */
  public async peerDeviceId(): Promise<string> {
    return (await this.stamp()).baseDeviceId;
  }

  /** Connected according to the OS (a ship's Wi-Fi without uplink still says yes — the calls then time out). */
  public async maybeOnline(): Promise<boolean> {
    try {
      return (await Network.getStatus()).connected && (typeof navigator === 'undefined' || navigator.onLine);
    } catch {
      return typeof navigator === 'undefined' || navigator.onLine;
    }
  }

  // ---------------------------------------------------------------- author and journals --------

  /** Kept from the last online start: AppStore has no user after an offline cold start on iOS. */
  public async author(): Promise<BoundAuthor | undefined> {
    return parseBoundAuthor(await this.db.getMeta(META_AUTHOR));
  }

  public async bindAuthor(author: BoundAuthor): Promise<void> {
    const next = nextBoundAuthor(await this.author(), author);
    if (next) await this.db.setMeta(META_AUTHOR, serializeBoundAuthor(next));
  }

  /** The journals as last fetched online (with their peer secret when prepared for the road). */
  public async cachedJournals(): Promise<OutboxJournal[]> {
    return parseOutboxJournals(await this.db.getMeta(META_JOURNALS));
  }

  /**
   * Online: the journals this person writes in (not archived), stored for offline use. With `prepare`, the peer secret of
   * each is fetched too (ensureJournalPeerSecret, authors only) — «Für unterwegs vorbereiten». A failed secret call keeps
   * a cached secret. Throws JournalOutboxOffline when the network is gone.
   */
  public async refreshJournals(personKey: string, prepare: boolean): Promise<OutboxJournal[]> {
    try {
      await ensureAppCheckToken();
      const snaps = await withTimeout(getDocsFromServer(query(collection(this.firestore, JournalCollection), where('authorKeys', 'array-contains', personKey))));
      const fetched = snaps.docs
        .filter((d) => d.data()['isArchived'] !== true)
        .map((d) => {
          const data = d.data();
          const tenants = Array.isArray(data['tenants']) ? (data['tenants'] as unknown[]).filter((t): t is string => typeof t === 'string') : [];
          return { journalKey: d.id, title: typeof data['title'] === 'string' ? data['title'] : '', tenantId: tenants[0] ?? '' };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
      const secrets: Record<string, string> = {};
      if (prepare) {
        for (const journal of fetched) {
          try {
            const { secret } = await this.call<{ secret: string }>('ensureJournalPeerSecret', { journalKey: journal.journalKey });
            if (typeof secret === 'string' && secret !== '') secrets[journal.journalKey] = secret;
          } catch (error) {
            if (isOfflineError(error)) throw error;
            console.warn('journal outbox: no peer secret for', journal.journalKey, error);
          }
        }
      }
      const merged = mergeOutboxJournals(await this.cachedJournals(), fetched, secrets, Date.now());
      await this.db.setMeta(META_JOURNALS, serializeOutboxJournals(merged));
      return merged;
    } catch (error) {
      throw isOfflineError(error) ? new JournalOutboxOffline() : error;
    }
  }

  // ---------------------------------------------------------------- building a delivery --------

  /**
   * Imports the visible photos (2048/400 by PhotoKit id), derives the copy (decision 2) and stores the stamped delivery:
   * images first, then the `track` create. `trip` gives what the copy reads (tripOfLocalTrack for a track on this phone),
   * `sections` the shown points per section. Refuses a trip that already waits for this journal; `online` additionally
   * checks the journal's change log (a trip attached on the iPad or sent before is not sent twice).
   */
  public send(input: { journalKey: string; trip: TripModel; sections: TrackCopyInput[]; authorKey: string; online: boolean }): Promise<OutboxSendResult> {
    return this.enqueue(async () => {
      await this.load();
      const { journalKey, trip } = input;
      const trackKey = trackKeyOf(journalKey, trip.okey);
      if (!trackKey) throw new Error(`journal outbox: trip ${trip.okey} gives no valid track key`);
      if (this.pendingSignal().some((d) => d.journalKey === journalKey && d.tripKey === trip.okey)) return { state: 'pending' };
      if (await this.wasSent(journalKey, trip.okey)) return { state: 'inJournal' };
      if (input.online && (await this.isInJournal(journalKey, trackKey).catch(() => false))) return { state: 'inJournal' };

      const plan = trackPhotoPlan(trip, []); // the phone holds no journal images: every visible photo is imported
      const imported = await importTrackPhotos(journalKey, plan.toImport);
      const copy = trackCopyOf(trip, input.sections, imported.keys);
      const drafts = trackDeliveryDrafts(journalKey, trackKey, copy, imported.drafts);
      const stamp = await this.stamp();
      const { delivery, stamp: next } = stampDelivery(
        stamp, { journalKey, tripKey: trip.okey, authorKey: input.authorKey, drafts, files: imported.files },
        drafts.map(() => crypto.randomUUID()), Date.now(),
      );
      try {
        await this.db.addDelivery(delivery, { [META_STAMP]: serializeOutboxStamp(next) });
      } catch (error) {
        for (const file of delivery.files) await JournalPhotos.deleteFile({ journalKey, file }).catch(() => undefined);
        throw error;
      }
      this.pendingSignal.update((list) => [...list, delivery]);
      return { state: 'queued', delivery, skipped: imported.skipped };
    });
  }

  // ---------------------------------------------------------------- online --------------------

  /**
   * Writes every pending delivery (or those of `journalKey`) to Firestore like an iPad (records with tenants and the
   * server's uploadedAt; a record already there counts as uploaded), then uploads its photo files through signed URLs
   * (prepareJournalPhotoUploads). A delivery that is through is dropped. Returns how many arrived and how many remain;
   * throws JournalOutboxOffline when the network is gone, other errors when the server refuses.
   */
  public deliverOnline(tenantId: string, journalKey?: string): Promise<{ delivered: number; remaining: number }> {
    return this.enqueue(async () => {
      await this.load();
      let delivered = 0;
      try {
        await ensureAppCheckToken();
        for (const delivery of this.pendingSignal().filter((d) => !journalKey || d.journalKey === journalKey)) {
          let current = delivery;
          if (!current.recordsUploaded) {
            await this.writeRecords(current.records, tenantId);
            current = { ...current, recordsUploaded: true };
            await this.db.updateDelivery(current);
            this.replace(current);
          }
          if (!(await this.uploadFiles(current))) continue; // a file failed: the next round tries again
          await this.dropNow(current);
          delivered++;
        }
      } catch (error) {
        if (isOfflineError(error)) throw new JournalOutboxOffline();
        throw error;
      }
      return { delivered, remaining: this.pendingSignal().filter((d) => !journalKey || d.journalKey === journalKey).length };
    });
  }

  /** P2P: an iPad holds the delivery's records and asked for none of its files afterwards — it has arrived. */
  public drop(deviceId: string): Promise<void> {
    return this.enqueue(async () => {
      const delivery = this.pendingSignal().find((d) => d.deviceId === deviceId);
      if (delivery) await this.dropNow(delivery);
    });
  }

  // ---------------------------------------------------------------- internals -----------------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined); // a failed task does not block the next one
    return run;
  }

  private replace(delivery: OutboxDelivery): void {
    this.pendingSignal.update((list) => list.map((d) => (d.deviceId === delivery.deviceId ? delivery : d)));
  }

  private async dropNow(delivery: OutboxDelivery): Promise<void> {
    await this.db.removeDelivery(delivery.deviceId);
    this.pendingSignal.update((list) => list.filter((d) => d.deviceId !== delivery.deviceId));
    await this.noteSent(delivery.journalKey, delivery.tripKey);
    for (const file of delivery.files) {
      await JournalPhotos.deleteFile({ journalKey: delivery.journalKey, file }).catch(() => undefined); // best effort
    }
  }

  private async stamp(): Promise<OutboxStamp> {
    const stored = parseOutboxStamp(await this.db.getMeta(META_STAMP));
    if (stored) return stored;
    const fresh: OutboxStamp = { baseDeviceId: crypto.randomUUID(), clock: undefined, deliveries: 0 };
    await this.db.setMeta(META_STAMP, serializeOutboxStamp(fresh));
    return fresh;
  }

  private async sentList(): Promise<string[]> {
    try {
      const list = JSON.parse((await this.db.getMeta(META_SENT)) ?? '[]') as unknown;
      return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }

  private async wasSent(journalKey: string, tripKey: string): Promise<boolean> {
    return (await this.sentList()).includes(sentKey(journalKey, tripKey));
  }

  private async noteSent(journalKey: string, tripKey: string): Promise<void> {
    const key = sentKey(journalKey, tripKey);
    const list = (await this.sentList()).filter((s) => s !== key);
    await this.db.setMeta(META_SENT, JSON.stringify([...list, key].slice(-SENT_MAX)));
  }

  /** The journal's change log holds a `track` record of this key (authors may read journal-changes). */
  private async isInJournal(journalKey: string, trackKey: string): Promise<boolean> {
    const snaps = await withTimeout(getDocsFromServer(query(
      collection(this.firestore, JournalChangeCollection),
      where('journalKey', '==', journalKey), where('entity', '==', 'track'), where('entityKey', '==', trackKey), limit(1),
    )));
    return !snaps.empty;
  }

  /** The iPad's upload path (JournalSyncService.uploadPage): a batch, then record by record when the batch is refused. */
  private async writeRecords(records: JournalChange[], tenantId: string): Promise<void> {
    const docOf = (c: JournalChange) => ({ ...c, tenants: [tenantId], uploadedAt: serverTimestamp() });
    for (const page of pagesOf(records, UPLOAD_PAGE)) {
      try {
        const batch = writeBatch(this.firestore);
        for (const c of page) batch.set(doc(this.firestore, JournalChangeCollection, c.id), docOf(c));
        await withTimeout(batch.commit());
      } catch (error) {
        if (isOfflineError(error)) throw error;
        // a record already there (an iPad uploaded it after a P2P transfer, or a lost response): decide one by one
        for (const c of page) {
          try {
            await withTimeout(setDoc(doc(this.firestore, JournalChangeCollection, c.id), docOf(c)));
          } catch (recordError) {
            if (isOfflineError(recordError)) throw recordError;
            const exists = await withTimeout(getDocFromServer(doc(this.firestore, JournalChangeCollection, c.id))).then((s) => s.exists(), () => false);
            if (classifyUploadError(errorCode(recordError), exists) !== 'uploaded') throw recordError;
          }
        }
      }
    }
  }

  /**
   * Uploads the delivery's photo files (the iPad uploads published files only; the phone uploads all of its own, since
   * it will not be around to hand them over later). False when a file failed; offline errors are thrown.
   */
  private async uploadFiles(delivery: OutboxDelivery): Promise<boolean> {
    const { journalKey } = delivery;
    let ok = true;
    for (const chunk of pagesOf(delivery.files, PHOTO_CHUNK)) {
      const { uploads } = await this.call<{ uploads: { file: string; done: boolean; url?: string; headers?: Record<string, string> }[] }>(
        'prepareJournalPhotoUploads', { journalKey, files: chunk });
      for (const upload of uploads) {
        try {
          if (!upload.done && upload.url) {
            const { status } = await JournalPhotos.uploadFile({ journalKey, file: upload.file, url: upload.url, headers: upload.headers ?? {} });
            if (status < 200 || status >= 300) ok = false;
          }
        } catch (error) {
          console.warn('journal outbox: a photo upload failed', upload.file, error);
          ok = false;
        }
      }
      if (uploads.length < chunk.length) ok = false; // a file the function did not accept
    }
    return ok;
  }

  private async call<T>(name: string, payload: unknown): Promise<T> {
    const functions = getFunctions(getApp(), 'europe-west6');
    return (await withTimeout(httpsCallable<unknown, T>(functions, name)(payload))).data;
  }
}
