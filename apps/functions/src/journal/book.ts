import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { logger } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { Firestore, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { AvatarInfo, JournalBookCollection, JournalBookExport, JournalBookModel, JournalChange, JournalChangeCollection, JournalCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { acceptRecord, BookLayout, coverLayout, DEFAULT_BLEED_MM, journalDocOf, layoutBook, materialize } from '@okr/travel-journal-util';

import { privateBucket } from '../_storage/private-bucket';
import { journalObjectPath } from './apply-journal-change.logic';
import { applyPdfX4, bookAsset, createBookDoc, pdfkitPaginate, writeBookPdf, writeCoverPdf } from './book-pdf';
import { BookExportKind, BookExportRequest, BookExportRequestError, bookObjectPath, canStartExport, parseBookExportRequest } from './book.logic';
import { memberName } from './guest.logic';
import { JournalCaller, requireJournalAuthor } from './journal-auth';

const REGION = 'europe-west6';
const SIGNED_URL_MS = 24 * 60 * 60 * 1000;
const PROGRESS_EVERY = 10; // pages

export interface ExportJournalBookResult { bookUrl: string; coverUrl?: string; pageCount: number; warnings: number }

type Bucket = ReturnType<typeof privateBucket>;

/** Marks the export as running in a transaction; refuses while another one runs (started < 60 min ago). */
async function startExport(db: Firestore, caller: JournalCaller, kind: BookExportKind, nowMs: number): Promise<JournalBookModel> {
  const ref = db.collection(JournalBookCollection).doc(caller.journalKey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.data() as Partial<JournalBookModel> | undefined;
    if (!canStartExport(stored?.export, nowMs)) throw new HttpsError('failed-precondition', 'An export of this book is already running.');
    const exp: JournalBookExport = { kind, state: 'running', progress: 0, startedAt: new Date(nowMs).toISOString() };
    // update() replaces the whole `export` map: no path or count of an earlier export survives
    if (snap.exists) tx.update(ref, { export: exp });
    else tx.set(ref, { tenants: [caller.tenantId], export: exp });
    return { ...new JournalBookModel(), ...stored, okey: caller.journalKey, tenants: stored?.tenants ?? [caller.tenantId] };
  });
}

/** The journal as the change log has it (accepted records only, as notify.ts reads it). */
async function journalState(db: Firestore, journalKey: string) {
  const snaps = await db.collection(JournalChangeCollection).where('journalKey', '==', journalKey).orderBy('uploadedAt').get();
  const changes = snaps.docs
    .map((d) => ({ change: d.data() as unknown as JournalChange, at: (d.data()['uploadedAt'] as Timestamp | undefined)?.toMillis() ?? 0 }))
    .filter((r) => acceptRecord(r.change, r.at))
    .map((r) => r.change);
  return materialize(changes);
}

/** The bytes of an object in the journal's folder, undefined when it is not there. */
async function readObject(bucket: Bucket, path: string): Promise<Buffer | undefined> {
  try {
    const [data] = await bucket.file(path).download();
    return data;
  } catch (e) {
    if ((e as { code?: number }).code === 404) return undefined;
    throw e;
  }
}

async function signedUrl(bucket: Bucket, path: string): Promise<string> {
  const [url] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + SIGNED_URL_MS });
  return url;
}

interface Written { bookPath: string; coverPath?: string; pageCount: number; warnings: number }

async function writeExport(db: Firestore, caller: JournalCaller, req: BookExportRequest, book: JournalBookModel, nowMs: number): Promise<Written> {
  const bucket = privateBucket();
  const ref = db.collection(JournalBookCollection).doc(caller.journalKey);
  const print = req.kind === 'print';
  const bleedMm = print ? (book.print?.bleedMm ?? DEFAULT_BLEED_MM) : 0;
  const layoutInput = print ? book : { ...book, print: { ...book.print, bleedMm: 0 } };

  const state = await journalState(db, caller.journalKey);
  const firestoreAuthors = ((await db.collection(JournalCollection).doc(caller.journalKey).get()).data()?.['authors'] ?? []) as AvatarInfo[];
  const authors = [...(journalDocOf(state, caller.journalKey, [])?.authors ?? []), ...(Array.isArray(firestoreAuthors) ? firestoreAuthors : [])];
  const authorName = (personKey: string) => memberName(personKey, authors, []);

  const path = (file: string) => journalObjectPath(caller.tenantId, caller.journalKey, file);
  let missing = 0;
  const image = async (imageKey: string) => {
    const data = (print ? await readObject(bucket, path(`${imageKey}-print.jpg`)) : undefined) ?? await readObject(bucket, path(`${imageKey}-2048.jpg`));
    if (!data) missing++;
    return data;
  };
  const mapImage = async (file: string) => {
    const data = await readObject(bucket, path(file));
    if (!data) missing++;
    return data;
  };

  // the book
  const doc = createBookDoc();
  const layout: BookLayout = layoutBook({ state, journalKey: caller.journalKey, book: layoutInput, labels: req.labels, authorName, paginate: pdfkitPaginate(doc) });
  if (print) applyPdfX4(doc, { title: layout.title, iccFogra: bookAsset('ISOcoated_v2_eci.icc'), trim: { w: 297, h: 210 }, bleedMm });
  const bookPath = bookObjectPath(caller.tenantId, caller.journalKey, req.kind, nowMs);
  const total = layout.pages.length;
  const written: string[] = [];
  try {
    written.push(bookPath);
    await streamPdf(bucket, doc, bookPath, () => writeBookPdf(doc, layout.pages, { bleedMm, x4: print, image, mapImage }, async (i) => {
      if ((i + 1) % PROGRESS_EVERY === 0 && i + 1 < total) await ref.update({ 'export.progress': Math.round(((i + 1) / total) * 100) });
    }));

    // the cover (print only, when a cover is ordered)
    let coverPath: string | undefined;
    const cover = print ? coverLayout(book, layout.title, layout.period, layout.coverImageKey) : undefined;
    if (cover) {
      const cdoc = createBookDoc();
      applyPdfX4(cdoc, { title: layout.title, iccFogra: bookAsset('ISOcoated_v2_eci.icc'), trim: { w: cover.width - 2 * bleedMm, h: cover.height - 2 * bleedMm }, bleedMm });
      coverPath = bookObjectPath(caller.tenantId, caller.journalKey, 'cover', nowMs);
      written.push(coverPath);
      await streamPdf(bucket, cdoc, coverPath, () => writeCoverPdf(cdoc, cover, { bleedMm, x4: true, image, mapImage }));
    }
    return { bookPath, coverPath, pageCount: total, warnings: layout.warnings.length + missing };
  } catch (e) {
    // no half-written PDF stays behind
    await Promise.all(written.map((p) => bucket.file(p).delete({ ignoreNotFound: true }).catch(() => undefined)));
    throw e;
  }
}

/**
 * Streams a document into a new bucket object while `draw` fills it. Only a complete document is ended: when `draw`
 * fails, the document is destroyed, which aborts the resumable upload so no truncated PDF is committed; the upload is
 * awaited (it rejects) before the caller deletes whatever might be left.
 */
async function streamPdf(bucket: Bucket, doc: PDFKit.PDFDocument, path: string, draw: () => Promise<void>): Promise<void> {
  const upload = pipeline(doc, bucket.file(path).createWriteStream({ contentType: 'application/pdf', resumable: true }));
  upload.catch(() => undefined); // awaited below; a failing upload must not reject unhandled while `draw` still runs
  try {
    await draw();
  } catch (e) {
    (doc as unknown as Readable).destroy(e instanceof Error ? e : new Error(String(e)));
    await upload.catch(() => undefined);
    throw e;
  }
  doc.end();
  await upload;
}

/**
 * The travel book as PDF (spec 1.113 phase 2, design 2026-10-24 §7): `{ op: 'export', journalKey, kind, labels }`.
 * `print` = PDF/X-4 with bleed from the print photos (`<imageKey>-print.jpg`, else `-2048.jpg`) plus the cover sheet
 * when one is ordered; `screen` = the 2048 px photos, no bleed, no PDF/X. Streamed into the private bucket at
 * `tenant/<tid>/journal/<jk>/book/<kind>-<ts>.pdf`; progress, paths and counts in `journal-books/{jk}.export`
 * (written only here). Returns signed read URLs valid for 24 h. Authors only; one export per book at a time.
 *
 * Its own function (not the journal router of the functions consolidation): one hour, 1 GiB, one instance. The
 * client must call it with a long callable timeout (httpsCallable option `timeout`).
 */
export const exportJournalBook = onCall(
  { region: REGION, cpu: 'gcf_gen1', memory: '1GiB', timeoutSeconds: 3600, maxInstances: 1, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<ExportJournalBookResult> => {
    checkAppCheckToken(request as never, 'exportJournalBook');
    checkAuthentication(request as never, 'exportJournalBook');
    let req: BookExportRequest;
    try {
      req = parseBookExportRequest(request.data);
    } catch (e) {
      if (e instanceof BookExportRequestError) throw new HttpsError('invalid-argument', e.message);
      throw e;
    }
    const db = getFirestore();
    const caller = await requireJournalAuthor(db, request.auth?.uid ?? '', req.journalKey);
    const nowMs = Date.now();
    const book = await startExport(db, caller, req.kind, nowMs);
    const ref = db.collection(JournalBookCollection).doc(caller.journalKey);
    const startedAt = new Date(nowMs).toISOString();
    try {
      const written = await writeExport(db, caller, req, book, nowMs);
      // sign first: a done export is never downgraded to failed by a signing error afterwards
      const bucket = privateBucket();
      const result: ExportJournalBookResult = {
        bookUrl: await signedUrl(bucket, written.bookPath),
        ...(written.coverPath ? { coverUrl: await signedUrl(bucket, written.coverPath) } : {}),
        pageCount: written.pageCount,
        warnings: written.warnings,
      };
      const exp: JournalBookExport = {
        kind: req.kind, state: 'done', progress: 100, startedAt, finishedAt: new Date().toISOString(),
        bookPath: written.bookPath, pageCount: written.pageCount, warnings: written.warnings,
        ...(written.coverPath ? { coverPath: written.coverPath } : {}),
      };
      await ref.update({ export: exp });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('exportJournalBook:export failed', { journalKey: caller.journalKey, kind: req.kind, error: message });
      const exp: JournalBookExport = { kind: req.kind, state: 'failed', startedAt, finishedAt: new Date().toISOString(), error: message.slice(0, 500) };
      await ref.update({ export: exp }).catch(() => undefined);
      throw new HttpsError('internal', 'The book could not be exported.');
    }
  },
);
