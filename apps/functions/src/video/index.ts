import { onObjectFinalized, StorageEvent } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { readdir, stat, unlink } from 'node:fs/promises';
import * as path from 'node:path';

import { DocumentRendering, renderingPath, upsertRendering } from '../vectorize/vectorize-path.util';
import { reportToSentry } from '../srv/sentry';
import {
  buildPosterArgs,
  buildTranscodeArgs,
  isAlbumVideoPath,
  isVideoUpload,
  retryUntilFound,
} from './video-path.util';

const REGION = 'europe-west6';
const DOCS_COLLECTION = 'docs';
const POSTER_SECOND = 2;
const TIMEOUT_SECONDS = 540;
/** Mirrors MAX_VIDEO_BYTES in @okr/shared-util-core. The client already refuses larger files;
 *  this is the backstop for an upload that bypassed the picker. */
const MAX_INPUT_BYTES = 200 * 1024 * 1024;
/** Nothing this instance is legitimately working on can be older than one full invocation. */
const TMP_MAX_AGE_MS = TIMEOUT_SECONDS * 1000;

/** Run ffmpeg once. Rejects with the tail of stderr, which is where ffmpeg says what went wrong. */
async function runFfmpeg(binary: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1000)}`)));
  });
}

/**
 * Delete leftovers of an invocation that never reached its `finally` — a timeout or an OOM kills
 * the instance outright, and `/tmp` is tmpfs, i.e. it counts against the memory limit. Without this
 * the victim is not the video that failed but the NEXT, healthy one, which dies of an OOM that
 * reads like an ffmpeg error in the log.
 *
 * Anything older than one full invocation cannot belong to work still in flight. Every error is
 * ignored: housekeeping must never be the reason a transcode does not happen.
 */
async function reapStaleTempFiles(): Promise<void> {
  const dir = tmpdir();
  const cutoff = Date.now() - TMP_MAX_AGE_MS;
  try {
    const names = await readdir(dir);
    await Promise.all(names.map(async (name) => {
      const file = path.join(dir, name);
      try {
        const info = await stat(file);
        if (info.isFile() && info.mtimeMs < cutoff) await unlink(file);
      } catch {
        // gone already, a directory, or not ours to delete — none of it is our problem
      }
    }));
  } catch {
    // /tmp unreadable — nothing to do
  }
}

/**
 * Transcode an uploaded album video into a playable mp4 plus a poster frame, both attached to the
 * document as renderings.
 *
 * Why renderings and not new fields: DocumentRendering is defined as "a conversion the CDN can not
 * perform", and the imgix Video API is not enabled on our source (spec §7.1) — so this is exactly
 * that.
 *
 * WHAT THIS DOES *NOT* BUY US — the derived files are NOT reaped on delete. An earlier version of
 * this comment claimed they were; that was wrong, and a comment that promises safety is worse than
 * no comment at all. The facts, as of this writing:
 *   - `DocumentService.delete()` calls `FirestoreService.deleteModel`, i.e. it ARCHIVES the
 *     document (isArchived) and touches Storage not at all — neither the original nor a rendering.
 *   - `DocumentService.hardDelete()` is the only path that calls `deleteRenderings()`, and its own
 *     doc comment restricts it to isolated documents; the sole caller is the RAG section.
 * For images this cost nothing worth counting — an orphaned SVG rendering. For videos every
 * deletion leaves roughly TWICE the clip behind (original plus mp4), forever, and the member who
 * deleted it has every reason to believe it is gone.
 *
 * Fixing that is deliberately NOT done here: `delete()` is shared by every document in the app and
 * the archive-vs-purge decision is a product one (see the `deleting-models` skill). The video
 * feature must not settle it as a side effect.
 *
 * Idempotent by way of upsertRendering: a second run replaces the entries in place. `concurrency: 1`
 * because a transcode holds its input plus two outputs in the memory-resident `/tmp` and saturates
 * both vCPUs — the v2 default of 80 parallel requests per instance would exhaust the 2 GiB long
 * before it exhausts the CPU, and an OOM skips every `finally` on the way out.
 *
 * `maxInstances: 5` is the other half of that. A Storage trigger cannot be scoped to a prefix: this
 * fires on EVERY object finalized anywhere in the project, and with `concurrency: 1` every one of
 * them wants an instance of its own. Someone dropping 40 photos into an album therefore starts 40
 * cold starts of a 2 GiB / 2 vCPU function that all return within milliseconds — billed in full,
 * and holding regional capacity that the transcodes actually waiting behind them need. Capping at
 * five costs the videos nothing worth having (a transcode runs minutes; a queue of five is the
 * normal shape of this workload) and bounds the blast radius of a bulk upload.
 */
export const onAlbumVideoFinalized = onObjectFinalized(
  {
    region: REGION,
    memory: '2GiB',
    timeoutSeconds: TIMEOUT_SECONDS,
    cpu: 2,
    concurrency: 1,
    maxInstances: 5,
    secrets: ['SENTRY_FUNCTIONS_DSN'],
  },
  async (event: StorageEvent): Promise<void> => {
    const objectName = event.data.name ?? '';
    const contentType = event.data.contentType ?? '';
    // Path first: it is a pure string test, while isVideoUpload does a mime lookup. Both are
    // cheap, but this trigger fires on EVERY object in the project, so the common case (a photo
    // anywhere in the bucket) should leave by the shortest route available.
    if (!isAlbumVideoPath(objectName)) return;
    // Not `contentType.startsWith('video/')`: see isVideoUpload — a .mov uploaded from Chrome
    // regularly arrives with no usable contentType at all, and gating on it alone left the
    // album tile in "wird aufbereitet" forever, silently.
    if (!isVideoUpload(objectName, contentType)) return;

    const size = Number(event.data.size ?? 0);
    if (size > MAX_INPUT_BYTES) {
      logger.warn(`onAlbumVideoFinalized: ${objectName} is ${size} bytes, skipping`);
      return;
    }

    // Before anything is written to /tmp, not after: this cleans up after a PREVIOUS invocation
    // that the platform killed, and the whole point is to do it while there is still room.
    await reapStaleTempFiles();

    const db = getFirestore();
    // This trigger fires at the END of the upload, while the client writes the docs document
    // immediately AFTER the upload resolves — so the trigger can legitimately win that race. The
    // bounded retry bridges that window instead of betting on the order: a hit costs no wait at
    // all, and if all five attempts come up empty the object really is not part of any album
    // (a video uploaded outside the picker), where giving up is the right answer.
    const lookup = await retryUntilFound(async () => {
      const snap = await db
        .collection(DOCS_COLLECTION)
        .where('fullPath', '==', objectName)
        .limit(1)
        .get();
      return snap.empty ? undefined : snap.docs[0];
    });
    if (!lookup.value) {
      // Deliberately info, not error: a video with no docs entry is legitimate, not a failure.
      // The attempt count tells the reader whether the window was actually waited out.
      logger.info(
        `onAlbumVideoFinalized: no docs entry for ${objectName} after ${lookup.attempts} attempts, skipping`,
      );
      return;
    }
    const docRef = lookup.value.ref;
    const docKey = docRef.id;
    const existing = (lookup.value.data()['renderings'] as DocumentRendering[] | undefined) ?? [];

    // Cloud Functions deliver at least once. A duplicate delivery would otherwise spend minutes of
    // two vCPUs producing a byte-identical result, so the finished mp4 is the natural short-circuit.
    if (existing.some((r) => r.format === 'mp4')) {
      logger.info(`onAlbumVideoFinalized: ${objectName} already has an mp4 rendering, skipping`);
      return;
    }
    const hadPoster = existing.some((r) => r.format === 'jpg');

    const bucket = admin.storage().bucket(event.data.bucket);
    // A duplicate delivery runs with the same docKey. Without the random segment both invocations
    // would write the same three files, and the first `finally` would delete the input out from
    // under the second.
    const unique = randomUUID();
    const localInput = path.join(tmpdir(), `${docKey}-${unique}-${path.basename(objectName)}`);
    const localVideo = path.join(tmpdir(), `${docKey}-${unique}.mp4`);
    const localPoster = path.join(tmpdir(), `${docKey}-${unique}.jpg`);

    const videoPath = renderingPath(objectName, docKey, 'mp4');
    const posterPath = renderingPath(objectName, docKey, 'jpg');
    /** Rendering objects this run created — deleted again if the document write never lands. */
    const uploaded: string[] = [];

    try {
      await bucket.file(objectName).download({ destination: localInput });

      // Dynamic import: ffmpeg-static resolves to a native binary and must not load at cold start
      // of every other function in this bundle (same reason as @neplex/vectorizer).
      const ffmpegModule = await import('ffmpeg-static');
      const ffmpeg = (ffmpegModule.default ?? ffmpegModule) as unknown as string;

      await runFfmpeg(ffmpeg, buildTranscodeArgs(localInput, localVideo));

      // The mp4 goes up FIRST and stands on its own. The poster is a nicety; the mp4 is the
      // feature, and nothing about the poster may cost us the transcode we already paid for.
      // The download token is written by US, not left to Firebase to backfill. The player resolves
      // this object with `getDownloadURL`, and a download URL is only obtainable when the object
      // carries a `firebaseStorageDownloadTokens` entry. Objects written through the Admin SDK do
      // not go through the Firebase layer that mints one; that a token appears anyway is emergent
      // behaviour of the storage endpoint, undocumented, and nothing else in this repo depends on
      // it. Minting it here costs one UUID and makes the playable URL a property of the upload
      // rather than a favour.
      await bucket.upload(localVideo, {
        destination: videoPath,
        metadata: {
          contentType: 'video/mp4',
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      });
      uploaded.push(videoPath);
      const [videoMeta] = await bucket.file(videoPath).getMetadata();

      let renderings = upsertRendering(existing, {
        format: 'mp4', fullPath: videoPath, mimeType: 'video/mp4',
        size: Number(videoMeta.size ?? 0), generator: 'ffmpeg',
      });

      // A clip shorter than POSTER_SECOND makes ffmpeg seek past the end of the file and exit
      // non-zero — and a 1.4-second clip is a perfectly legitimate upload. So: try the nice frame,
      // fall back to the very first one, and if even that fails, ship the video without a poster.
      let posterTaken = false;
      try {
        await runFfmpeg(ffmpeg, buildPosterArgs(localInput, localPoster, POSTER_SECOND));
        posterTaken = true;
      } catch (posterError) {
        logger.info(
          `onAlbumVideoFinalized: no frame at ${POSTER_SECOND}s in ${objectName} (probably shorter) — retrying at 0s`,
          posterError,
        );
        try {
          await runFfmpeg(ffmpeg, buildPosterArgs(localInput, localPoster, 0));
          posterTaken = true;
        } catch (firstFrameError) {
          logger.warn(
            `onAlbumVideoFinalized: could not take any poster frame from ${objectName} — continuing with the mp4 only`,
            firstFrameError,
          );
        }
      }

      if (posterTaken) {
        await bucket.upload(localPoster, { destination: posterPath, metadata: { contentType: 'image/jpeg' } });
        // Only a poster THIS run created is ours to clean up again — overwriting a pre-existing
        // one and then deleting it on a failure would break a rendering that already worked.
        if (!hadPoster) uploaded.push(posterPath);
        const [posterMeta] = await bucket.file(posterPath).getMetadata();
        renderings = upsertRendering(renderings, {
          format: 'jpg', fullPath: posterPath, mimeType: 'image/jpeg',
          size: Number(posterMeta.size ?? 0), generator: 'ffmpeg',
        });
      }

      await docRef.set({ renderings }, { merge: true });
      uploaded.length = 0; // the document now points at them; they are no longer orphans

      logger.info(
        `onAlbumVideoFinalized: ${objectName} → ${videoPath} (${videoMeta.size} bytes)${posterTaken ? ' + poster' : ' (no poster)'}`,
      );
    } catch (error) {
      // No processingState field by design (spec §7.3): "no mp4 rendering" IS the waiting state,
      // and a video stuck in it is a support case. Cloud Functions have no Sentry log integration
      // — `reportToSentry` is an explicit reporter that every call site must call itself, so a
      // log line alone would never raise a ticket.
      logger.error(`onAlbumVideoFinalized failed for ${objectName}`, error);
      await reportToSentry({
        message: 'onAlbumVideoFinalized: video transcode failed',
        tags: { docKey, bucket: event.data.bucket },
        extra: { objectName, size, error: error instanceof Error ? error.message : String(error) },
      });
      // Whatever made it to Storage before the failure is unreachable: the delete path follows
      // renderings[], and no entry points at these. Take them back out.
      await Promise.all(uploaded.map((file) =>
        bucket.file(file).delete().catch(() => undefined)));
    } finally {
      await Promise.all([localInput, localVideo, localPoster].map(
        (file) => unlink(file).catch(() => undefined)));
    }
  },
);
