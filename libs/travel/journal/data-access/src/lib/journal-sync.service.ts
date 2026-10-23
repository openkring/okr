import { Injectable, inject, signal } from '@angular/core';
import { getApp } from 'firebase/app';
import {
  collection, doc, DocumentSnapshot, getDocFromServer, getDocsFromServer, limit, orderBy, query, serverTimestamp, setDoc, startAfter,
  Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FIRESTORE, ensureAppCheckToken } from '@okr/shared-config';
import { JournalChange, JournalChangeCollection, JournalCollection } from '@okr/shared-models';
import {
  acceptRecord, advanceCursor, classifyUploadError, DOWNLOAD_PAGE, downloadStart, pagesOf, UPLOAD_PAGE,
} from '@okr/travel-journal-util';

import { JournalDb, RemoteChange } from './journal-db';
import { JournalIdentityService } from './journal-identity.service';
import { JournalPhotos } from './journal-photos.plugin';

/**
 * Firebase sync of the travel journal (spec 1.113 §5.3, plan 4). One round: upload this device's
 * pending records → download records newer than the per-journal cursor → peer secret → photo files.
 * SQLite stays the source of truth; nothing relies on the Firestore cache (memory-only on iOS), so
 * every read goes to the server and every call has a timeout: offline, a write would otherwise wait
 * for the network forever.
 */
export interface JournalSyncContext {
  tenantId: string;
  personKey: string;
  photosPaused: boolean;
  /** Photo files of a journal from the merged state: published ones go up, all of them are wanted locally. */
  photoFiles: (journalKey: string) => { published: string[]; all: string[] };
  /** Called after records were downloaded, before the photo phase — the store reloads its state. */
  onRecordsStored: () => Promise<void>;
}

export type JournalSyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface JournalSyncStatus {
  state: JournalSyncState;
  pendingRecords: number;
  pendingPhotos: number;
  lastSyncAt?: number;
  error: string;
}

const CALL_TIMEOUT_MS = 30_000;
const PHOTO_CHUNK = 50;
const META_CURSOR = 'cursor:';
const META_PEER = 'peerSecret:';

class SyncTimeout extends Error {
  public readonly code = 'deadline-exceeded';
}

function withTimeout<T>(promise: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SyncTimeout('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code.replace(/^(firestore|functions)\//, '') : undefined;
}

const isOffline = (error: unknown): boolean => ['unavailable', 'deadline-exceeded'].includes(errorCode(error) ?? '');

@Injectable({ providedIn: 'root' })
export class JournalSyncService {
  private readonly db = inject(JournalDb);
  private readonly identity = inject(JournalIdentityService);
  private readonly firestore = inject(FIRESTORE);
  private readonly statusSignal = signal<JournalSyncStatus>({ state: 'idle', pendingRecords: 0, pendingPhotos: 0, error: '' });
  private running?: Promise<void>;

  public readonly status = this.statusSignal.asReadonly();

  /** One round at a time: a second call while a round runs joins it. */
  public sync(ctx: JournalSyncContext): Promise<void> {
    this.running ??= this.round(ctx).finally(() => (this.running = undefined));
    return this.running;
  }

  private patch(p: Partial<JournalSyncStatus>): void {
    this.statusSignal.update((s) => ({ ...s, ...p }));
  }

  private async round(ctx: JournalSyncContext): Promise<void> {
    this.patch({ state: 'syncing', error: '' });
    try {
      await ensureAppCheckToken();
      await this.uploadRecords(ctx);
      const journalKeys = await this.journalKeys(ctx);
      let stored = 0;
      for (const journalKey of journalKeys) stored += await this.downloadRecords(journalKey);
      if (stored > 0) await ctx.onRecordsStored();
      for (const journalKey of journalKeys) await this.ensurePeerSecret(journalKey);
      const pendingPhotos = ctx.photosPaused ? await this.countPendingPhotos(ctx, journalKeys) : await this.syncPhotos(ctx, journalKeys);
      this.patch({ state: 'idle', lastSyncAt: Date.now(), pendingRecords: await this.db.countPendingUploads(), pendingPhotos });
    } catch (error) {
      this.patch({
        state: isOffline(error) ? 'offline' : 'error',
        error: isOffline(error) ? '' : String((error as Error)?.message ?? error),
        pendingRecords: await this.db.countPendingUploads().catch(() => this.statusSignal().pendingRecords),
      });
    }
  }

  // ---------------------------------------------------------------- records up --------------

  private async uploadRecords(ctx: JournalSyncContext): Promise<void> {
    const stopped = new Set<string>(); // journals not (yet) accepted this round
    for (;;) {
      const pending = (await this.db.pendingUploads(UPLOAD_PAGE * 5)).filter((c) => !stopped.has(c.journalKey));
      if (pending.length === 0) return;
      const byJournal = new Map<string, JournalChange[]>();
      for (const c of pending) byJournal.set(c.journalKey, [...(byJournal.get(c.journalKey) ?? []), c]);
      for (const [journalKey, changes] of byJournal) {
        for (const page of pagesOf(changes, UPLOAD_PAGE)) {
          if (!(await this.uploadPage(page, ctx))) { stopped.add(journalKey); break; }
        }
      }
    }
  }

  /** False when the journal does not accept records yet (stop it for this round). */
  private async uploadPage(page: JournalChange[], ctx: JournalSyncContext): Promise<boolean> {
    const docOf = (c: JournalChange) => ({ ...c, tenants: [ctx.tenantId], uploadedAt: serverTimestamp() });
    try {
      const batch = writeBatch(this.firestore);
      for (const c of page) batch.set(doc(this.firestore, JournalChangeCollection, c.id), docOf(c));
      await withTimeout(batch.commit());
      await this.db.markUploaded(page.map((c) => c.id), Date.now());
      return true;
    } catch (error) {
      if (isOffline(error)) throw error;
      // one record already there (a lost response) or not yet allowed: decide record by record
      for (const c of page) {
        try {
          await withTimeout(setDoc(doc(this.firestore, JournalChangeCollection, c.id), docOf(c)));
          await this.db.markUploaded([c.id], Date.now());
        } catch (recordError) {
          if (isOffline(recordError)) throw recordError;
          const exists = await withTimeout(getDocFromServer(doc(this.firestore, JournalChangeCollection, c.id)))
            .then((snap) => snap.exists(), () => false);
          const outcome = classifyUploadError(errorCode(recordError), exists);
          if (outcome === 'uploaded') await this.db.markUploaded([c.id], Date.now());
          else if (outcome === 'stop') return false;
          else throw recordError;
        }
      }
      return true;
    }
  }

  // ---------------------------------------------------------------- records down ------------

  /** The journals this person writes in (server) plus the ones on this device. */
  private async journalKeys(ctx: JournalSyncContext): Promise<string[]> {
    const snaps = await withTimeout(getDocsFromServer(query(collection(this.firestore, JournalCollection), where('authorKeys', 'array-contains', ctx.personKey))));
    const keys = new Set(snaps.docs.filter((d) => d.data()['isArchived'] !== true).map((d) => d.id));
    for (const c of await this.db.listChanges()) if (c.entity === 'journal') keys.add(c.journalKey);
    return [...keys];
  }

  /** Pages of DOWNLOAD_PAGE, the cursor stored after each page. Returns the number of records received. */
  private async downloadRecords(journalKey: string): Promise<number> {
    let cursor = Number(await this.db.getMeta(META_CURSOR + journalKey)) || undefined;
    const from = Timestamp.fromMillis(downloadStart(cursor));
    let last: DocumentSnapshot | undefined;
    let received = 0;
    for (;;) {
      const constraints = [where('journalKey', '==', journalKey), where('uploadedAt', '>=', from), orderBy('uploadedAt'), limit(DOWNLOAD_PAGE)];
      const q = last ? query(collection(this.firestore, JournalChangeCollection), ...constraints, startAfter(last))
        : query(collection(this.firestore, JournalChangeCollection), ...constraints);
      let snaps;
      try {
        snaps = await withTimeout(getDocsFromServer(q));
      } catch (error) {
        if (errorCode(error) === 'permission-denied') return received; // not (yet) an author of this journal
        throw error;
      }
      if (snaps.empty) return received;
      const remote: RemoteChange[] = snaps.docs.map((d) => {
        const data = d.data() as JournalChange & { uploadedAt?: Timestamp };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { uploadedAt, tenants, ...change } = data;
        return { change: change as JournalChange, uploadedAtMs: uploadedAt?.toMillis() ?? Date.now() };
      });
      await this.db.appendRemoteChanges(remote);
      await this.identity.receiveClocks(remote.filter((r) => acceptRecord(r.change, r.uploadedAtMs)).map((r) => r.change.hlc));
      cursor = advanceCursor(cursor, remote.map((r) => r.uploadedAtMs));
      if (cursor !== undefined) await this.db.setMeta(META_CURSOR + journalKey, String(cursor));
      received += remote.length;
      if (snaps.docs.length < DOWNLOAD_PAGE) return received;
      last = snaps.docs[snaps.docs.length - 1];
    }
  }

  // ---------------------------------------------------------------- peer secret -------------

  private async ensurePeerSecret(journalKey: string): Promise<void> {
    if (await this.db.getMeta(META_PEER + journalKey)) return;
    try {
      const { secret } = await this.call<{ secret: string }>('ensureJournalPeerSecret', { journalKey });
      if (secret) await this.db.setMeta(META_PEER + journalKey, secret);
    } catch (error) {
      if (isOffline(error)) throw error;
      // failed-precondition: the journal is not materialised yet — next round
    }
  }

  // ---------------------------------------------------------------- photos ------------------

  private async countPendingPhotos(ctx: JournalSyncContext, journalKeys: string[]): Promise<number> {
    let n = 0;
    for (const journalKey of journalKeys) {
      const published = new Set(ctx.photoFiles(journalKey).published);
      n += (await this.db.photoFiles(journalKey)).filter((f) => published.has(f.file) && f.present && !f.uploaded).length;
    }
    return n;
  }

  /** Uploads published photos this device holds, downloads every missing one; returns what is still pending. */
  private async syncPhotos(ctx: JournalSyncContext, journalKeys: string[]): Promise<number> {
    let pending = 0;
    for (const journalKey of journalKeys) {
      const { published, all } = ctx.photoFiles(journalKey);
      await this.db.notePhotoFiles(journalKey, all, false);
      const notPresent = (await this.db.photoFiles(journalKey)).filter((f) => !f.present).map((f) => f.file);
      for (const chunk of pagesOf(notPresent, PHOTO_CHUNK)) {
        const { files } = await JournalPhotos.presentFiles({ journalKey, files: chunk });
        await this.db.notePhotoFiles(journalKey, files, true);
      }

      const rows = await this.db.photoFiles(journalKey);
      const publishedSet = new Set(published);
      const toUpload = rows.filter((f) => publishedSet.has(f.file) && f.present && !f.uploaded).map((f) => f.file);
      for (const chunk of pagesOf(toUpload, PHOTO_CHUNK)) {
        const { uploads } = await this.call<{ uploads: { file: string; done: boolean; url?: string; headers?: Record<string, string> }[] }>(
          'prepareJournalPhotoUploads', { journalKey, files: chunk });
        for (const upload of uploads) {
          try {
            if (!upload.done && upload.url) await JournalPhotos.uploadFile({ journalKey, file: upload.file, url: upload.url, headers: upload.headers ?? {} });
            await this.db.markPhotosUploaded([upload.file]);
          } catch {
            pending += 1; // stays pending, retried next round; records are unaffected
          }
        }
      }

      const missing = rows.filter((f) => !f.present).map((f) => f.file);
      for (const chunk of pagesOf(missing, PHOTO_CHUNK)) {
        const { urls } = await this.call<{ urls: Record<string, string> }>('signJournalPhotos', { journalKey, files: chunk });
        for (const [file, url] of Object.entries(urls)) {
          try {
            await JournalPhotos.downloadFile({ journalKey, file, url });
            await this.db.notePhotoFiles(journalKey, [file], true);
          } catch {
            // next round
          }
        }
      }
    }
    return pending + await this.countPendingPhotos(ctx, journalKeys);
  }

  private async call<T>(name: string, payload: unknown): Promise<T> {
    const functions = getFunctions(getApp(), 'europe-west6');
    return (await withTimeout(httpsCallable<unknown, T>(functions, name)(payload))).data;
  }
}
