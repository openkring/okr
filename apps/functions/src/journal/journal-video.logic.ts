/** Pure parts of the journal video conversion (spec 1.113 phase 5): ffmpeg arguments, ffprobe-style parsing, names. */

export const JOURNAL_VIDEO_MAX_SOURCE_BYTES = 524_288_000;
export const JOURNAL_VIDEO_MAX_SECONDS = 60;
export const JOURNAL_VIDEO_MAX_BYTES = 7_800_000;

/** Long side `side` px, never enlarged, aspect kept (ffmpeg has already applied the rotation). */
function scaleFilter(side: number): string {
  return `scale=w='if(gt(iw,ih),min(${side},iw),-2)':h='if(gt(iw,ih),-2,min(${side},ih))'`;
}

export function buildJournalTranscodeArgs(input: string, output: string, videoKbps: 900 | 630): string[] {
  return [
    '-i', input,
    '-vf', scaleFilter(960),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    '-movflags', '+faststart',
    '-y', output,
  ];
}

export function buildJournalPosterArgs(input: string, out2048: string, out400: string, atSecond: number): string[] {
  return [
    '-ss', String(atSecond), '-i', input,
    '-frames:v', '1', '-vf', scaleFilter(2048), '-q:v', '3', '-y', out2048,
    '-frames:v', '1', '-vf', scaleFilter(400), '-q:v', '3', '-y', out400,
  ];
}

export interface FfmpegInfo {
  durationSec?: number;
  width?: number;
  height?: number;
  rotation?: number;
  creationTime?: string;
  latitude?: number;
  longitude?: number;
}

/** Reads the report `ffmpeg -i <file>` prints to stderr. Width/height come back upright (swapped for ±90°). */
export function parseFfmpegInfo(stderr: string): FfmpegInfo {
  const info: FfmpegInfo = {};
  const dur = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (dur) info.durationSec = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

  const videoLine = stderr.split('\n').find((l) => /Stream #\d+:\d+.*Video:/.test(l));
  const size = videoLine ? /\b(\d{2,5})x(\d{2,5})\b/.exec(videoLine) : null;
  const rot = /^\s*rotate\s*:\s*(-?\d+)/m.exec(stderr) ?? /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  if (rot) info.rotation = Math.round(Number(rot[1]));
  if (size) {
    const swap = info.rotation !== undefined && Math.abs(info.rotation) % 180 === 90;
    info.width = Number(size[swap ? 2 : 1]);
    info.height = Number(size[swap ? 1 : 2]);
  }

  const wall = /^\s*com\.apple\.quicktime\.creationdate\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/m.exec(stderr)
    ?? /^\s*creation_time\s*:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/m.exec(stderr);
  if (wall) info.creationTime = wall[1];

  const loc = /^\s*(?:com\.apple\.quicktime\.location\.ISO6709|location(?:-\w+)?)\s*:\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/m.exec(stderr);
  if (loc) {
    info.latitude = Number(loc[1]);
    info.longitude = Number(loc[2]);
  }
  return info;
}

/** The poster frame: second 1, or the first frame of a clip shorter than that. */
export function posterSecond(durationSec: number): number {
  return durationSec >= 1 ? 1 : 0;
}

export function journalVideoName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(name);
}
