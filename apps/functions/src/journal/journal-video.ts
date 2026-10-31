import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { stat, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { reapStaleTempFiles, probeFfmpeg, runFfmpeg } from '../video/ffmpeg';
import { journalObjectPath } from './apply-journal-change.logic';
import { requireJournalAuthor } from './journal-auth';
import {
  buildJournalPosterArgs, buildJournalTranscodeArgs, JOURNAL_VIDEO_MAX_BYTES, JOURNAL_VIDEO_MAX_SECONDS,
  JOURNAL_VIDEO_MAX_SOURCE_BYTES, journalVideoName, parseFfmpegInfo, posterSecond,
} from './journal-video.logic';

const REGION = 'europe-west6';
const URL_WINDOW_MS = 15 * 60 * 1000;
const SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface JournalVideoResult {
  width: number;
  height: number;
  durationSec: number;
  takenAt?: string;
  latitude?: number;
  longitude?: number;
}

function requestName(data: unknown): string {
  const name = (data as { name?: unknown } | undefined)?.name;
  if (!journalVideoName(name)) throw new HttpsError('invalid-argument', 'Invalid name.');
  return name;
}

/** Signed PUT URL (15 min) for the browser original `<name>-source`, any video up to 500 MB. */
export const prepareJournalVideoUpload = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ url: string; headers: Record<string, string> }> => {
    checkAppCheckToken(request as never, 'prepareJournalVideoUpload');
    checkAuthentication(request as never, 'prepareJournalVideoUpload');
    const caller = await requireJournalAuthor(getFirestore(), request.auth?.uid ?? '', (request.data as { journalKey?: unknown })?.journalKey);
    const name = requestName(request.data);
    const contentType = (request.data as { contentType?: unknown }).contentType;
    if (typeof contentType !== 'string' || !contentType.startsWith('video/') || contentType.length > 100) {
      throw new HttpsError('invalid-argument', 'Not a video.');
    }
    const headers = { 'Content-Type': contentType, 'x-goog-content-length-range': `0,${JOURNAL_VIDEO_MAX_SOURCE_BYTES}` };
    const [url] = await privateBucket().file(journalObjectPath(caller.tenantId, caller.journalKey, `${name}-source`)).getSignedUrl({
      version: 'v4', action: 'write', expires: Date.now() + URL_WINDOW_MS, contentType,
      extensionHeaders: { 'x-goog-content-length-range': headers['x-goog-content-length-range'] },
    });
    return { url, headers };
  },
);

/**
 * Converts the uploaded browser original into the web version (H.264/AAC MP4, ≤ 7.8 MB) plus the two posters,
 * all next to it in the private bucket. The original is deleted on every outcome; refusals are
 * `failed-precondition` with `tooLong` | `tooLarge` | `unreadable`.
 */
export const convertJournalVideo = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '2GiB', cpu: 2, timeoutSeconds: 300, maxInstances: 3 },
  async (request: CallableRequest<unknown>): Promise<JournalVideoResult> => {
    checkAppCheckToken(request as never, 'convertJournalVideo');
    checkAuthentication(request as never, 'convertJournalVideo');
    const caller = await requireJournalAuthor(getFirestore(), request.auth?.uid ?? '', (request.data as { journalKey?: unknown })?.journalKey);
    const name = requestName(request.data);
    const bucket = privateBucket();
    const objectPath = (file: string) => journalObjectPath(caller.tenantId, caller.journalKey, file);
    const source = bucket.file(objectPath(`${name}-source`));

    const unique = randomUUID();
    const localInput = path.join(tmpdir(), `jv-${unique}-source`);
    const localVideo = path.join(tmpdir(), `jv-${unique}.mp4`);
    const localPoster2048 = path.join(tmpdir(), `jv-${unique}-2048.jpg`);
    const localPoster400 = path.join(tmpdir(), `jv-${unique}-400.jpg`);
    try {
      let size: number;
      try {
        const [meta] = await source.getMetadata();
        size = Number(meta.size ?? 0);
      } catch {
        throw new HttpsError('failed-precondition', 'unreadable');
      }
      // before anything is downloaded: the signed range already caps the upload, this is the backstop
      if (size > JOURNAL_VIDEO_MAX_SOURCE_BYTES) throw new HttpsError('failed-precondition', 'tooLarge');

      await reapStaleTempFiles();
      await source.download({ destination: localInput });

      const ffmpegModule = await import('ffmpeg-static');
      const ffmpeg = (ffmpegModule.default ?? ffmpegModule) as unknown as string;

      const info = parseFfmpegInfo(await probeFfmpeg(ffmpeg, localInput));
      if (info.durationSec === undefined || info.width === undefined || info.height === undefined) {
        throw new HttpsError('failed-precondition', 'unreadable');
      }
      if (info.durationSec > JOURNAL_VIDEO_MAX_SECONDS) throw new HttpsError('failed-precondition', 'tooLong');

      try {
        await runFfmpeg(ffmpeg, buildJournalTranscodeArgs(localInput, localVideo, 900));
        if ((await stat(localVideo)).size > JOURNAL_VIDEO_MAX_BYTES) {
          await runFfmpeg(ffmpeg, buildJournalTranscodeArgs(localInput, localVideo, 630));
          if ((await stat(localVideo)).size > JOURNAL_VIDEO_MAX_BYTES) throw new HttpsError('failed-precondition', 'tooLarge');
        }
        await runFfmpeg(ffmpeg, buildJournalPosterArgs(localInput, localPoster2048, localPoster400, posterSecond(info.durationSec)));
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.warn('convertJournalVideo: ffmpeg failed', error instanceof Error ? error.message.slice(0, 500) : 'unknown');
        throw new HttpsError('failed-precondition', 'unreadable');
      }

      await Promise.all([
        bucket.upload(localVideo, { destination: objectPath(`${name}-video.mp4`), metadata: { contentType: 'video/mp4' } }),
        bucket.upload(localPoster2048, { destination: objectPath(`${name}-2048.jpg`), metadata: { contentType: 'image/jpeg' } }),
        bucket.upload(localPoster400, { destination: objectPath(`${name}-400.jpg`), metadata: { contentType: 'image/jpeg' } }),
      ]);

      const result: JournalVideoResult = { width: info.width, height: info.height, durationSec: info.durationSec };
      if (info.creationTime !== undefined) result.takenAt = info.creationTime;
      if (info.latitude !== undefined && info.longitude !== undefined) {
        result.latitude = info.latitude;
        result.longitude = info.longitude;
      }
      return result;
    } finally {
      await Promise.all([localInput, localVideo, localPoster2048, localPoster400].map((file) => unlink(file).catch(() => undefined)));
      // the original has done its job on every outcome (success, refusal, crash of the conversion)
      await source.delete({ ignoreNotFound: true }).catch((error: unknown) => {
        logger.warn('convertJournalVideo: could not delete the source', error instanceof Error ? error.message : 'unknown');
      });
    }
  },
);

const SOURCE_OBJECT = /^tenant\/[^/]+\/journal\/[^/]+\/[^/]+-source$/;

/** Daily: browser originals whose conversion never came (tab closed after the upload) are removed after 24 h. */
export const sweepJournalVideoSources = onSchedule(
  { schedule: 'every 24 hours', region: REGION, timeZone: 'Europe/Zurich', cpu: 'gcf_gen1', memory: '256MiB', maxInstances: 1, timeoutSeconds: 540 },
  async () => {
    const cutoff = Date.now() - SOURCE_MAX_AGE_MS;
    const [files] = await privateBucket().getFiles({ prefix: 'tenant/' });
    let removed = 0;
    for (const file of files) {
      if (!SOURCE_OBJECT.test(file.name)) continue;
      if (new Date(String(file.metadata.timeCreated ?? '')).getTime() >= cutoff) continue;
      await file.delete({ ignoreNotFound: true }).then(() => { removed += 1; }, () => undefined);
    }
    logger.info(`sweepJournalVideoSources: removed ${removed}`);
  },
);
