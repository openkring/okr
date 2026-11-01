/** Pure parts of the journal video conversion (spec 1.113 phase 5): ffmpeg arguments, ffprobe-style parsing, names. */

export const JOURNAL_VIDEO_MAX_SOURCE_BYTES = 524_288_000;
export const JOURNAL_VIDEO_MAX_SECONDS = 60;
export const JOURNAL_VIDEO_MAX_BYTES = 7_800_000;

/** Long side `side` px, never enlarged, aspect kept (ffmpeg has already applied the rotation). */
function scaleFilter(side: number): string {
  return `scale=w='if(gt(iw,ih),min(${side},iw),-2)':h='if(gt(iw,ih),-2,min(${side},ih))'`;
}

/**
 * HLG / PQ (iPhone HDR) to BT.709 SDR; without it the clip comes out washed out. Runs AFTER the scale: the float32
 * planes of a 4K frame are ~100 MB, at 960 px a sixteenth of that (a 60 s 4K HLG clip must convert well inside 300 s).
 */
const TONE_MAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

function videoFilter(side: number, hdr: boolean): string {
  return hdr ? `${scaleFilter(side)},${TONE_MAP}` : scaleFilter(side);
}

/** Only local files: the input is untrusted, a playlist or concat file must not make ffmpeg open anything else. */
const FILE_ONLY = ['-protocol_whitelist', 'file'];

export function buildJournalTranscodeArgs(input: string, output: string, videoKbps: 900 | 630, hdr = false): string[] {
  return [
    ...FILE_ONLY, '-i', input,
    // never more than the clip limit, whatever the file claims about its own length
    '-t', String(JOURNAL_VIDEO_MAX_SECONDS),
    '-vf', videoFilter(960, hdr),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    '-movflags', '+faststart',
    '-y', output,
  ];
}

export function buildJournalPosterArgs(input: string, out2048: string, out400: string, atSecond: number, hdr = false): string[] {
  return [
    '-ss', String(atSecond), ...FILE_ONLY, '-i', input,
    '-frames:v', '1', '-vf', videoFilter(2048, hdr), '-q:v', '3', '-y', out2048,
    '-frames:v', '1', '-vf', videoFilter(400, hdr), '-q:v', '3', '-y', out400,
  ];
}

/** Arguments of the probe run (`ffmpeg -i`), local files only. */
export function buildJournalProbeArgs(input: string): string[] {
  return ['-hide_banner', ...FILE_ONLY, '-i', input];
}

/** Container demuxers a journal clip may come in: MP4/MOV (phones, Safari) and Matroska/WebM (Chrome, Firefox). */
export function isAcceptedContainer(stderr: string): boolean {
  const line = /^Input #0, ([^ ]+), from /m.exec(stderr);
  if (!line) return false;
  return line[1].split(',').some((f) => ['mov', 'mp4', 'matroska', 'webm'].includes(f));
}

const STALE_SOURCE = /^tenant\/[^/]+\/journal\/[^/]+\/[^/]+-source$/;
const SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A browser original older than 24 h. A missing or invalid creation time never counts as stale. */
export function isStaleSource(name: string, timeCreated: unknown, nowMs: number): boolean {
  if (!STALE_SOURCE.test(name) || typeof timeCreated !== 'string') return false;
  const createdMs = new Date(timeCreated).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return false;
  return nowMs - createdMs > SOURCE_MAX_AGE_MS;
}

export interface FfmpegInfo {
  durationSec?: number;
  width?: number;
  height?: number;
  rotation?: number;
  creationTime?: string;
  latitude?: number;
  longitude?: number;
  hdr?: boolean;
}

/** Reads the report `ffmpeg -i <file>` prints to stderr. Width/height come back upright (swapped for ±90°). */
export function parseFfmpegInfo(stderr: string): FfmpegInfo {
  const info: FfmpegInfo = {};
  const dur = /^ {2}Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/m.exec(stderr);
  if (dur) info.durationSec = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

  const videoLine = stderr.split('\n').find((l) => /Stream #\d+:\d+.*Video:/.test(l));
  info.hdr = videoLine !== undefined && /arib-std-b67|smpte2084/.test(videoLine);
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
