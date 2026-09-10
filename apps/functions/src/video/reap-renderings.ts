import { onObjectDeleted, StorageEvent } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

import { DocumentRendering } from '../vectorize/vectorize-path.util';
import { reportToSentry } from '../srv/sentry';
import { isAlbumSourcePath, isOwnRendering } from './video-path.util';

const REGION = 'europe-west6';
const DOCS_COLLECTION = 'docs';

/**
 * Reap the derived files of an album/document upload when the ORIGINAL disappears from Storage.
 *
 * Why this exists: `onAlbumVideoFinalized` writes two files per video — a transcoded mp4 and a
 * poster jpg — under `<dir>/renderings/<docKey>.{mp4,jpg}`. Nothing on the delete side removed
 * them, so every deleted clip left roughly TWICE its own size in the bucket, forever. For images
 * the same gap cost one orphaned SVG, which nobody could be bothered to count; for video it is the
 * dominant storage cost of the feature.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES **NOT** SOLVE — read this before assuming album deletions are now clean.
 *
 * The delete a member actually performs in the UI is `DocumentService.delete()`, which calls
 * `FirestoreService.deleteModel`, i.e. it ARCHIVES the document (`isArchived: true`) and touches
 * Storage not at all. `deleteAsGroupAdmin` / the `deleteGroupContent` CF do the same thing
 * server-side, deliberately ("Storage files are left in place — exactly like DocumentService.delete").
 * In every one of those cases NO Storage object is deleted, so THIS TRIGGER NEVER FIRES and every
 * byte — original, mp4 and poster alike — stays in the bucket.
 *
 * So the honest scope is:
 *   ✔ covered — the original object really leaves the bucket: `hardDelete()` (RAG documents), an
 *     admin deleting the object in the Firebase console or via `gsutil`, a lifecycle rule, any
 *     future purge path. This trigger is the backstop that makes those paths complete without
 *     each of them having to know what a rendering is. (`hardDelete()` already reaps renderings
 *     itself; this makes that best-effort client-side loop no longer the only line of defence,
 *     e.g. when the browser is closed mid-delete.)
 *   ✘ NOT covered — archiving, which is the only delete route the product offers a member today.
 *     Closing that gap means deciding whether archiving should purge Storage at all, and that is
 *     a product decision about every document type in the app, not a video one (see the
 *     `deleting-models` skill). It is deliberately not settled here.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Sizing: this function downloads nothing and transcodes nothing — it does one Firestore query and
 * at most a handful of `delete()` calls. The transcoder's 2 GiB / 2 vCPU would be pure waste, and
 * a Storage trigger cannot be scoped to a prefix, so this fires on EVERY object deleted anywhere
 * in the project and leaves through `isAlbumSourcePath` in microseconds for almost all of them.
 * `maxInstances` bounds the cost of a bulk delete (emptying a folder of 500 files) instead of
 * letting it fan out unbounded.
 */
export const onAlbumSourceDeleted = onObjectDeleted(
  {
    region: REGION,
    memory: '256MiB',
    cpu: 1,
    concurrency: 10,
    timeoutSeconds: 60,
    maxInstances: 10,
    secrets: ['SENTRY_FUNCTIONS_DSN'],
  },
  async (event: StorageEvent): Promise<void> => {
    const objectName = event.data.name ?? '';

    // ── Loop guard ────────────────────────────────────────────────────────────────────────────
    // Everything this function deletes lives under `renderings/`, and every one of those deletes
    // fires `onObjectDeleted` again. `isAlbumSourcePath` excludes `renderings/` — the SAME test,
    // via the same helper, that stops `onAlbumVideoFinalized` from transcoding its own output.
    // Keeping both triggers on one predicate is the point: a rendering is either a derived file
    // for both of them or for neither, and there is no second place to forget to update.
    // The recursion therefore terminates after exactly one hop for every object we delete.
    if (!isAlbumSourcePath(objectName)) return;

    const bucket = admin.storage().bucket(event.data.bucket);

    // ── Overwrite guard ───────────────────────────────────────────────────────────────────────
    // An OVERWRITE in GCS is a delete of the old generation plus a finalize of the new one, and we
    // are handed the delete. Re-uploading a clip under the same name would therefore race
    // `onAlbumVideoFinalized`: it writes the new mp4, we arrive with the old event and delete it.
    // If the name still resolves, a newer generation exists and the renderings belong to IT.
    const [stillPresent] = await bucket.file(objectName).exists();
    if (stillPresent) {
      logger.info(`onAlbumSourceDeleted: ${objectName} was overwritten, not removed — nothing to reap`);
      return;
    }

    try {
      const db = getFirestore();
      // The `docs` entry is the ONLY thing that maps an object back to its renderings: the
      // rendering file name is the document key, which the source path does not contain. If the
      // document is already gone (a true hard delete that removed Firestore first), there is no
      // way to identify the derived files from the path alone and this is a no-op — the
      // client-side `deleteRenderings()` in `hardDelete()` covers that ordering.
      // The query is intentionally not filtered on `isArchived`: an archived document is exactly
      // the case we most want to reap.
      const snap = await db
        .collection(DOCS_COLLECTION)
        .where('fullPath', '==', objectName)
        .limit(1)
        .get();
      if (snap.empty) {
        logger.info(`onAlbumSourceDeleted: no docs entry for ${objectName}, nothing to reap`);
        return;
      }

      const docRef = snap.docs[0].ref;
      const docKey = docRef.id;
      const renderings = (snap.docs[0].data()['renderings'] as DocumentRendering[] | undefined) ?? [];
      if (renderings.length === 0) return;

      /** Entries that stay on the document: foreign paths, and reaps that failed. */
      const kept: DocumentRendering[] = [];
      let deleted = 0;

      for (const rendering of renderings) {
        // `renderings[]` is client-writable. Deleting whatever path it names would make this
        // trigger an arbitrary-delete primitive, so only a file in this document's own
        // `renderings/` directory, named after this document, is ours to remove.
        if (!isOwnRendering(objectName, docKey, rendering.fullPath ?? '')) {
          logger.warn(
            `onAlbumSourceDeleted: ${docKey} lists a rendering outside its own renderings/ directory (${rendering.fullPath}) — left untouched`,
          );
          kept.push(rendering);
          continue;
        }
        try {
          await bucket.file(rendering.fullPath).delete({ ignoreNotFound: true });
          deleted++;
        } catch (error) {
          // Keep the entry when the delete failed: the array is what a later reap or a
          // `hardDelete()` follows, and dropping the pointer would strand the file for good.
          logger.warn(`onAlbumSourceDeleted: could not delete ${rendering.fullPath}`, error);
          kept.push(rendering);
        }
      }

      // ── Do we also clean up `renderings[]` on the still-existing document? YES. ──────────────
      // Both answers are defensible and this one is deliberate. Leaving the entries would keep a
      // document whose original is gone advertising an mp4 and a poster that no longer exist: the
      // album tile would try to play a 404, `hardDelete()` would later log a failed delete per
      // stale entry, and every future reader would have to re-derive that the array is a lie.
      // The array is an index, not a record of what once existed — a dangling index entry is worse
      // than a missing one. The counter-argument (an audit trail of what was reaped) is served by
      // the log line below, which is where an operator would look anyway.
      // Note what is NOT done here: the document itself is left exactly as it is. Whether a
      // document whose file vanished should be archived or deleted is the product decision this
      // function stays out of.
      if (deleted > 0) {
        await docRef.set({ renderings: kept }, { merge: true });
      }

      logger.info(
        `onAlbumSourceDeleted: ${objectName} → reaped ${deleted} rendering(s), ${kept.length} entr(y|ies) kept`,
      );
    } catch (error) {
      // Cloud Functions have no Sentry log integration: a log line alone raises no ticket, so an
      // unexpected failure is reported explicitly, exactly as the transcoder does.
      logger.error(`onAlbumSourceDeleted failed for ${objectName}`, error);
      await reportToSentry({
        message: 'onAlbumSourceDeleted: reaping renderings failed',
        tags: { bucket: event.data.bucket },
        extra: { objectName, error: error instanceof Error ? error.message : String(error) },
      });
    }
  },
);
