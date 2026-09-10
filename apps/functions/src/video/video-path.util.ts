import { getMimeType } from '@okr/shared-util-core';

/** Directories whose video uploads are transcoded. `ocr` and `rag` have their own triggers. */
const ALBUM_PATH = /^tenant\/[^/]+\/(section\/[^/]+\/album|folder\/[^/]+\/album|document)\//;

/**
 * Whether a finalized object is an album/document video upload we own.
 *
 * The `renderings/` exclusion is what stops the function from triggering on its own output —
 * an mp4 rendering finalizes exactly like an upload does, and without this the function would
 * transcode its own result forever.
 */
export function isAlbumVideoPath(objectName: string): boolean {
  return isAlbumSourcePath(objectName);
}

/**
 * Whether an object is a DERIVED file (a rendering) rather than a source upload.
 *
 * The single place that knows what a rendering path looks like. Both video triggers gate on it,
 * in opposite directions but for the same reason — a trigger that fires on its own output runs
 * forever:
 *   - `onAlbumVideoFinalized` must not transcode the mp4 it just wrote.
 *   - `onAlbumSourceDeleted` must not reap the reaping: every object IT deletes fires
 *     `onObjectDeleted` again, and without this test the second delivery would look for the
 *     renderings of a rendering.
 */
export function isRenderingPath(objectName: string): boolean {
  return objectName.includes('/renderings/');
}

/**
 * Whether an object is a SOURCE upload under the album/document paths — i.e. an original a member
 * put there, not something a trigger derived from one.
 *
 * `isAlbumVideoPath` is the historical name of exactly this test and stays as an alias: the
 * transcoder reads better with it, and its own callers already narrow to videos with
 * `isVideoUpload` on the next line. The reaper deliberately uses the general name, because it is
 * not video-specific — an SVG rendering of a vectorized image is reaped by the same rule.
 */
export function isAlbumSourcePath(objectName: string): boolean {
  if (!ALBUM_PATH.test(objectName)) return false;
  return !isRenderingPath(objectName);
}

/**
 * Whether `renderingFullPath` is plausibly a rendering OF `sourceFullPath` produced for `docKey`:
 * it must sit in the source's own `renderings/` sibling directory and be named `<docKey>.<format>`
 * — the exact shape `renderingPath()` mints.
 *
 * This is a containment check, not a formality. The reaper takes the paths it deletes from
 * `DocumentModel.renderings[]`, which is client-writable data: a document whose `renderings[]`
 * named `tenant/other/document/annual-report.pdf` would otherwise turn a storage trigger into an
 * arbitrary-delete primitive. An entry that fails this test is logged and left alone — never
 * deleted, and never silently dropped from the array either.
 */
export function isOwnRendering(
  sourceFullPath: string,
  docKey: string,
  renderingFullPath: string,
): boolean {
  const slash = sourceFullPath.lastIndexOf('/');
  const dir = slash < 0 ? '' : sourceFullPath.slice(0, slash);
  const expectedDir = `${dir ? dir + '/' : ''}renderings`;

  const rSlash = renderingFullPath.lastIndexOf('/');
  if (rSlash < 0) return false;
  if (renderingFullPath.slice(0, rSlash) !== expectedDir) return false;

  const base = renderingFullPath.slice(rSlash + 1);
  // `<docKey>.<format>` and nothing else: a bare `<docKey>` or a second dot-segment is not ours.
  const dot = base.indexOf('.');
  if (dot <= 0) return false;
  if (base.slice(0, dot) !== docKey) return false;
  const format = base.slice(dot + 1);
  return format.length > 0 && !format.includes('.') && !format.includes('/');
}

/**
 * Whether a finalized object is a video, judged the same way the rest of the chain judges it.
 *
 * The Storage `contentType` alone is not usable as the gate. `uploadToFirebaseStorage` passes no
 * explicit contentType, so whatever the browser guessed into `File.type` wins — and for a .mov
 * that is regularly the empty string in Chrome and Firefox, which Firebase then stores as
 * `application/x-www-form-urlencoded` (147 such objects live in the bucket today). Gating on
 * `contentType.startsWith('video/')` therefore drops precisely the iPhone clips this trigger
 * exists for, and drops them silently: no mp4 rendering is produced, so the album tile says
 * "wird aufbereitet" forever, with no log line and no ticket to notice it by.
 *
 * The extension is what the rest of the chain already trusts: `DocumentModel.mimeType` comes from
 * `resolveMimeType(file.name, file.type)`, and storage.rules gates the raised size cap on the
 * extension too. This uses the same `getMimeType` lookup underneath.
 *
 * Deliberately an OR and not `resolveMimeType`'s "declared type wins, extension fills in": a
 * declared type of `application/x-www-form-urlencoded` is not a considered answer, it is the
 * absence of one, and letting it veto the extension is exactly the bug. Erring towards `true` is
 * the cheap direction — a false positive costs one ffmpeg run that fails and is reported, a false
 * negative costs a tile that never finishes and nobody hears about. The path gate
 * (`isAlbumVideoPath`) has already narrowed the input to album uploads either way.
 */
export function isVideoUpload(objectName: string, contentType: string): boolean {
  if (contentType.toLowerCase().startsWith('video/')) return true;
  return getMimeType(objectName).toLowerCase().startsWith('video/');
}

/**
 * Downscale to at most 720 lines, both dimensions even.
 *
 * `-2` on the width keeps the aspect ratio and rounds to an even number, which libx264 requires.
 * The height needs the same treatment and did not have it: a source of odd height (1080p rotated
 * and cropped by a phone editor is routinely 1079 or 607 lines) is SHORTER than 720, so
 * `min(720,ih)` passed the odd height straight through and libx264 refused the frame size —
 * "height not divisible by 2" — which failed the whole transcode. `trunc(ih/2)*2` rounds the
 * source height down to even BEFORE the cap, so both branches of the min() are even.
 */
const SCALE_TO_720 = "scale=-2:'min(720,trunc(ih/2)*2)'";

/**
 * H.264/AAC in an mp4, height capped at 720. `+faststart` moves the moov atom to the front so
 * playback starts before the file is fully downloaded.
 */
export function buildTranscodeArgs(input: string, output: string): string[] {
  return [
    '-i', input,
    '-vf', SCALE_TO_720,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', output,
  ];
}

/**
 * One frame as the poster. `-ss` BEFORE `-i` seeks by keyframe and is orders of magnitude
 * faster than decoding up to that point.
 *
 * Scaled with the same filter as the video. Without it the frame was written at the SOURCE
 * resolution: a 4K clip produced a multi-megabyte JPEG sitting permanently in the bucket, to be
 * used as a grid thumbnail a few hundred pixels wide. The poster must never be larger than the
 * video it is a poster for.
 */
export function buildPosterArgs(input: string, output: string, atSecond: number): string[] {
  return [
    '-ss', String(atSecond), '-i', input,
    '-vf', SCALE_TO_720,
    '-frames:v', '1', '-q:v', '3', '-y', output,
  ];
}

/** Attempts of the `docs` lookup before the object counts as "not part of any album". */
export const DOC_LOOKUP_ATTEMPTS = 5;
/** Pause between two lookup attempts. Five attempts therefore span a ~10 s window. */
export const DOC_LOOKUP_DELAY_MS = 2000;

export interface RetryUntilFoundOptions {
  /** Injected in tests so the wait is not actually served. Never set in production. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryUntilFoundResult<T> {
  /** The first defined value an attempt returned, or `undefined` if none did. */
  value: T | undefined;
  /** How many attempts were made — 1 on an immediate hit, DOC_LOOKUP_ATTEMPTS when it gave up. */
  attempts: number;
}

/**
 * Run `attempt` until it returns something, up to `DOC_LOOKUP_ATTEMPTS` times, pausing
 * `DOC_LOOKUP_DELAY_MS` in between.
 *
 * The first attempt runs immediately and a hit never waits, so the common case costs nothing. This
 * exists to bridge a genuine race and not as a general-purpose retry: the Storage trigger fires at
 * the END of the upload, while the client writes the `docs` document immediately AFTER the upload
 * resolves — so the trigger can legitimately arrive first. Waiting a bounded moment turns that from
 * luck into a guarantee. Kept free of Firestore so it is testable without a connection.
 */
export async function retryUntilFound<T>(
  attempt: (attemptNo: number) => Promise<T | undefined>,
  options: RetryUntilFoundOptions = {},
): Promise<RetryUntilFoundResult<T>> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  for (let attemptNo = 1; attemptNo <= DOC_LOOKUP_ATTEMPTS; attemptNo++) {
    const value = await attempt(attemptNo);
    if (value !== undefined) return { value, attempts: attemptNo };
    if (attemptNo < DOC_LOOKUP_ATTEMPTS) await sleep(DOC_LOOKUP_DELAY_MS);
  }
  return { value: undefined, attempts: DOC_LOOKUP_ATTEMPTS };
}
