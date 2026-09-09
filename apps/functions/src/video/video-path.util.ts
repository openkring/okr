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
