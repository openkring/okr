import { onObjectFinalized, StorageEvent } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { unlink } from 'node:fs/promises';
import * as path from 'node:path';

import { DocumentRendering, renderingPath, upsertRendering } from '../vectorize/vectorize-path.util';
import {
  buildPosterArgs,
  buildTranscodeArgs,
  isAlbumVideoPath,
  retryUntilFound,
} from './video-path.util';

const REGION = 'europe-west6';
const DOCS_COLLECTION = 'docs';
const POSTER_SECOND = 2;
/** Mirrors MAX_VIDEO_BYTES in @okr/shared-util-core. The client already refuses larger files;
 *  this is the backstop for an upload that bypassed the picker. */
const MAX_INPUT_BYTES = 200 * 1024 * 1024;

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
 * Transcode an uploaded album video into a playable mp4 plus a poster frame, both attached to the
 * document as renderings.
 *
 * Why renderings and not new fields: DocumentRendering is defined as "a conversion the CDN can not
 * perform", and the imgix Video API is not enabled on our source (spec §7.1) — so this is exactly
 * that. It also means the existing delete path already reaps the derived files.
 *
 * Idempotent by way of upsertRendering: a second run replaces the entries in place.
 */
export const onAlbumVideoFinalized = onObjectFinalized(
  { region: REGION, memory: '2GiB', timeoutSeconds: 540, cpu: 2 },
  async (event: StorageEvent): Promise<void> => {
    const objectName = event.data.name ?? '';
    const contentType = event.data.contentType ?? '';
    if (!contentType.startsWith('video/')) return;
    if (!isAlbumVideoPath(objectName)) return;

    const size = Number(event.data.size ?? 0);
    if (size > MAX_INPUT_BYTES) {
      logger.warn(`onAlbumVideoFinalized: ${objectName} is ${size} bytes, skipping`);
      return;
    }

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

    const bucket = admin.storage().bucket(event.data.bucket);
    const localInput = path.join(tmpdir(), `${docKey}-${path.basename(objectName)}`);
    const localVideo = path.join(tmpdir(), `${docKey}.mp4`);
    const localPoster = path.join(tmpdir(), `${docKey}.jpg`);

    try {
      await bucket.file(objectName).download({ destination: localInput });

      // Dynamic import: ffmpeg-static resolves to a native binary and must not load at cold start
      // of every other function in this bundle (same reason as @neplex/vectorizer).
      const ffmpegModule = await import('ffmpeg-static');
      const ffmpeg = (ffmpegModule.default ?? ffmpegModule) as unknown as string;

      await runFfmpeg(ffmpeg, buildTranscodeArgs(localInput, localVideo));
      await runFfmpeg(ffmpeg, buildPosterArgs(localInput, localPoster, POSTER_SECOND));

      const videoPath = renderingPath(objectName, docKey, 'mp4');
      const posterPath = renderingPath(objectName, docKey, 'jpg');
      await bucket.upload(localVideo, { destination: videoPath, metadata: { contentType: 'video/mp4' } });
      await bucket.upload(localPoster, { destination: posterPath, metadata: { contentType: 'image/jpeg' } });

      const [videoMeta] = await bucket.file(videoPath).getMetadata();
      const [posterMeta] = await bucket.file(posterPath).getMetadata();

      let renderings = upsertRendering(existing, {
        format: 'mp4', fullPath: videoPath, mimeType: 'video/mp4',
        size: Number(videoMeta.size ?? 0), generator: 'ffmpeg',
      });
      renderings = upsertRendering(renderings, {
        format: 'jpg', fullPath: posterPath, mimeType: 'image/jpeg',
        size: Number(posterMeta.size ?? 0), generator: 'ffmpeg',
      });
      await docRef.set({ renderings }, { merge: true });

      logger.info(`onAlbumVideoFinalized: ${objectName} → ${videoPath} (${videoMeta.size} bytes) + poster`);
    } catch (error) {
      // No processingState field by design (spec §7.3): "no mp4 rendering" IS the waiting state,
      // and a video stuck in it is a support case. The error must reach Sentry, so it is logged
      // as an error rather than swallowed.
      logger.error(`onAlbumVideoFinalized failed for ${objectName}`, error);
    } finally {
      await Promise.all([localInput, localVideo, localPoster].map(
        (file) => unlink(file).catch(() => undefined)));
    }
  },
);
