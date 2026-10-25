import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { arrayRemove, arrayUnion, deleteField, doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { map, Observable } from 'rxjs';
import { FirestoreService } from '@okr/shared-data-access';
import { JournalBookCollection, JournalBookModel } from '@okr/shared-models';
import { BookLabels, stripUndefined } from '@okr/travel-journal-util';

/** Response of the exportJournalBook callable: signed links (24 h), page count and warning count. */
export interface JournalBookExportResult { bookUrl: string; coverUrl?: string; pageCount: number; warnings: number }
/** One file of prepareJournalPhotoUploads: `done` = already in the bucket, else a signed PUT URL with its headers. */
export interface JournalFileUpload { file: string; done: boolean; url?: string; headers?: Record<string, string> }

const REGION = 'europe-west6';
/** The export runs up to an hour in the function (timeoutSeconds 3600); the SDK default of 70 s would abort the call. */
const EXPORT_TIMEOUT_MS = 3_600_000;
const UPLOAD_CHUNK = 50; // prepareJournalPhotoUploads takes at most 50 files per call

/**
 * The travel book document of a journal (spec 1.113 phase 2 §6), `journal-books/{journalKey}`. Authors only
 * (rules); `export` is written by the exportJournalBook function and is never sent from here.
 *
 * Two authors may edit at once: fields another writer can touch have their own targeted method
 * (`setHidden`, `setFitWhole`, `setPrint`, `removeAlbum`). Do not send those arrays/maps whole through `update`.
 */
@Injectable({ providedIn: 'root' })
export class JournalBookService {
  private readonly firestoreService = inject(FirestoreService);

  /** Live book document of the journal, with model defaults filled in; emits undefined while it does not exist yet. */
  public book$(journalKey: string): Observable<JournalBookModel | undefined> {
    // not an OkrModel (no isArchived: a book is never archived, rules forbid delete), so readObject + okey by hand
    return this.firestoreService.readObject<JournalBookModel>(JournalBookCollection, journalKey).pipe(
      map((data) => {
        if (!data) return undefined;
        const defaults = new JournalBookModel();
        return { ...defaults, ...data, print: { ...defaults.print, ...data.print }, okey: journalKey };
      }),
    );
  }

  /**
   * Merge `patch` into the book (creating it on first write); fields not in the patch stay. Maps merge key-wise,
   * arrays and whole map entries (`footprints.<pageKey>`, `albums.<sectionKey>`) are replaced by the patch value.
   * Callers must NOT send whole arrays/maps that another writer touches (`hiddenImageKeys`, `fitWhole`, `prints`,
   * `albums` removal): use the targeted methods. `export` and `okey` are never sent.
   */
  public async update(journalKey: string, tenantId: string, patch: Partial<JournalBookModel>, personKey: string): Promise<void> {
    const { export: _export, okey: _okey, ...rest } = patch;
    void _export; void _okey;
    await this.write(journalKey, tenantId, rest, personKey);
  }

  /** Reset an album block to the automatic layout: removes `albums[albumKey]`. */
  public removeAlbum(journalKey: string, tenantId: string, albumKey: string, personKey: string): Promise<void> {
    return this.write(journalKey, tenantId, { albums: { [albumKey]: deleteField() } }, personKey);
  }

  /** Hide / show one photo; concurrent edits of different photos both survive. */
  public setHidden(journalKey: string, tenantId: string, imageKey: string, hidden: boolean, personKey: string): Promise<void> {
    return this.write(journalKey, tenantId, { hiddenImageKeys: hidden ? arrayUnion(imageKey) : arrayRemove(imageKey) }, personKey);
  }

  /** Switch «ganz zeigen» of one photo on / off. */
  public setFitWhole(journalKey: string, tenantId: string, imageKey: string, fit: boolean, personKey: string): Promise<void> {
    return this.write(journalKey, tenantId, { fitWhole: fit ? arrayUnion(imageKey) : arrayRemove(imageKey) }, personKey);
  }

  /** Record the pixel size of one uploaded print photo; touches only `prints[imageKey]`. */
  public setPrint(journalKey: string, tenantId: string, imageKey: string, size: { width: number; height: number }, personKey: string): Promise<void> {
    return this.write(journalKey, tenantId, { prints: { [imageKey]: size } }, personKey);
  }

  // FieldValue sentinels (deleteField, arrayUnion, arrayRemove) are only valid in the targeted methods, hence `unknown`.
  private async write(journalKey: string, tenantId: string, patch: Record<string, unknown>, personKey: string): Promise<void> {
    if (!journalKey || !tenantId) throw new Error('JournalBookService: journalKey and tenantId are mandatory.');
    const data = stripUndefined({ ...patch, tenants: [tenantId], updatedAt: new Date().toISOString(), updatedBy: personKey });
    await setDoc(doc(this.firestoreService.firestore, `${JournalBookCollection}/${journalKey}`), data, { merge: true });
  }

  /**
   * Starts the PDF export (book task 6): the function lays the book out again with the same util, writes the PDF(s)
   * to the private bucket and reports progress in `export` of the book document. Resolves when the PDF is written.
   */
  public async exportBook(journalKey: string, kind: 'print' | 'screen', labels: BookLabels): Promise<JournalBookExportResult> {
    const fn = httpsCallable<unknown, JournalBookExportResult>(getFunctions(getApp(), REGION), 'exportJournalBook', { timeout: EXPORT_TIMEOUT_MS });
    return (await fn({ op: 'export', journalKey, kind, labels })).data;
  }

  /**
   * Signed upload URLs for files of the journal folder. Files already there come back `done` — unless `overwrite` is
   * set: then book maps (`book-map-*.jpg`, ruling R9) get a URL anyway, every other file still comes back `done`.
   */
  public async prepareUploads(journalKey: string, files: string[], overwrite = false): Promise<JournalFileUpload[]> {
    const fn = httpsCallable<unknown, { uploads: JournalFileUpload[] }>(getFunctions(getApp(), REGION), 'prepareJournalPhotoUploads');
    const out: JournalFileUpload[] = [];
    for (let i = 0; i < files.length; i += UPLOAD_CHUNK) {
      out.push(...(await fn({ journalKey, files: files.slice(i, i + UPLOAD_CHUNK), ...(overwrite ? { overwrite: true } : {}) })).data.uploads);
    }
    return out;
  }

  /** Fresh 24 h links of the book's last finished export (ruling R10); empty when there is none. */
  public async exportLinks(journalKey: string): Promise<Partial<JournalBookExportResult>> {
    const fn = httpsCallable<unknown, Partial<JournalBookExportResult>>(getFunctions(getApp(), REGION), 'exportJournalBook');
    return (await fn({ op: 'links', journalKey })).data;
  }

  /** PUTs a file to its signed URL from the browser (the iPad uses the native plugin instead). */
  public async putFile(upload: JournalFileUpload, data: Blob): Promise<void> {
    if (!upload.url) return;
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers ?? {}, body: data });
    if (!response.ok) throw new Error(`upload of ${upload.file} failed: ${response.status}`);
  }
}
