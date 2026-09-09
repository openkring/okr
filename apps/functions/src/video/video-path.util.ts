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
  if (!ALBUM_PATH.test(objectName)) return false;
  return !objectName.includes('/renderings/');
}

/**
 * H.264/AAC in an mp4, height capped at 720. `-2` on the width keeps the aspect ratio and
 * rounds to an even number, which libx264 requires. `+faststart` moves the moov atom to the
 * front so playback starts before the file is fully downloaded.
 */
export function buildTranscodeArgs(input: string, output: string): string[] {
  return [
    '-i', input,
    '-vf', "scale=-2:'min(720,ih)'",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', output,
  ];
}

/** One frame as the poster. `-ss` BEFORE `-i` seeks by keyframe and is orders of magnitude
 *  faster than decoding up to that point. */
export function buildPosterArgs(input: string, output: string, atSecond: number): string[] {
  return ['-ss', String(atSecond), '-i', input, '-frames:v', '1', '-q:v', '3', '-y', output];
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
