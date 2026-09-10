import { MatrixMessage } from '@okr/shared-models';

/**
 * Extension → canonical video MIME type, used whenever the browser cannot determine the
 * type itself. This is the video twin of EXTENSION_MIME_TYPES in image.util.ts and exists
 * for the same reason: `File.type` is empty for anything picked through the iOS Files app /
 * iCloud Drive or shared into the PWA, and a video with an empty type would be classified
 * as a generic document — uploaded fine, rendered as a paper-clip card, never playable.
 *
 * Kept separate from the image map on purpose: `isImageFileName` derives "is this an image"
 * from that map, so a video extension in it would make every .mov an image.
 */
const VIDEO_EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
};

const VIDEO_EXTENSIONS = Object.keys(VIDEO_EXTENSION_MIME_TYPES);

/**
 * The video MIME type implied by a filename's extension, or undefined for a name that
 * does not end in a known video extension.
 */
export function videoMimeTypeForName(name: string): string | undefined {
  const lower = name.toLowerCase();
  const ext = VIDEO_EXTENSIONS.find(e => lower.endsWith(e));
  return ext ? VIDEO_EXTENSION_MIME_TYPES[ext] : undefined;
}

/** Returns true if the file is a video (MIME type or, for an empty type, extension match). */
export function isVideoFile(file: File): boolean {
  if (file.type) return file.type.startsWith('video/');
  return videoMimeTypeForName(file.name) !== undefined;
}

/**
 * Returns true if a received message should be rendered with a video player.
 *
 * Covers `m.video` and — deliberately — the `m.file` events this app sent before it
 * knew about `m.video`: those carry a perfectly good `mimetype: video/*` and would
 * otherwise stay document cards forever.
 *
 * The declared mimetype always wins over the extension. That matters for `.webm`, which
 * is both a video and an audio container: `audio/webm` must NOT reach the video branch,
 * and an untyped `.webm` is treated as video because that is the far more common case
 * for a chat attachment.
 */
export function isVideoMessage(message: MatrixMessage): boolean {
  if (message.type === 'm.video') return true;
  const mimetype: string = message.content?.info?.mimetype || '';
  if (mimetype) return mimetype.startsWith('video/');
  return videoMimeTypeForName(message.body || '') !== undefined;
}

/** Longest edge of a generated poster frame, in pixels. */
export const VIDEO_POSTER_MAX_EDGE = 800;

/**
 * The poster size for a video of the given dimensions: the source size, scaled down so
 * that neither edge exceeds `maxEdge`. Never scales up — a 320x240 clip keeps its size
 * rather than being blown up into a blurry 800px JPEG.
 */
export function posterTargetSize(
  width: number,
  height: number,
  maxEdge = VIDEO_POSTER_MAX_EDGE
): { width: number; height: number } {
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** A poster frame extracted from a video file, ready to be uploaded alongside it. */
export interface VideoPoster {
  blob: Blob;
  width: number;
  height: number;
  /** Duration of the source video in milliseconds, as `m.video`'s `info.duration` wants it. */
  durationMs: number;
  /** Dimensions of the source video, for `info.w` / `info.h`. */
  videoWidth: number;
  videoHeight: number;
}

/**
 * Grab a single frame from a video file and return it as a JPEG, together with the
 * metadata an `m.video` event needs.
 *
 * Every failure path resolves to `null` rather than throwing — a missing poster must never
 * stop a video from being sent. That is not a theoretical concern: the browser decodes the
 * file here, and Chrome and Firefox cannot decode many of the `.mov` files an iPhone
 * produces. Those uploads simply travel without a thumbnail.
 *
 * The element is attached to the document (off-screen) because some browsers will not
 * decode a frame for a detached element, and it is muted + `playsInline` so no autoplay
 * policy blocks the seek.
 */
export async function extractVideoPoster(file: File, timeoutMs = 5000): Promise<VideoPoster | null> {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return null;

  let objectUrl = '';
  let video: HTMLVideoElement | undefined;

  try {
    objectUrl = URL.createObjectURL(file);
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);

    const el = video;
    const poster = await withTimeout(timeoutMs, (async (): Promise<VideoPoster | null> => {
      el.src = objectUrl;
      await onceOrThrow(el, 'loadedmetadata');

      const videoWidth = el.videoWidth;
      const videoHeight = el.videoHeight;
      const duration = el.duration;
      const size = posterTargetSize(videoWidth, videoHeight);
      if (size.width === 0) return null;

      // One second in, or the midpoint of anything shorter: the very first frame of a
      // phone recording is often black or a blurred autofocus sweep.
      el.currentTime = isFinite(duration) && duration > 0 ? Math.min(1, duration / 2) : 0;
      await onceOrThrow(el, 'seeked');

      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext('2d')!.drawImage(el, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', 0.7)
      );

      return {
        blob,
        width: size.width,
        height: size.height,
        durationMs: isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0,
        videoWidth,
        videoHeight,
      };
    })());

    return poster;
  } catch {
    // Undecodable codec, a seek that never completes, a canvas the browser refuses to
    // read — all of it means "no thumbnail", never "no video".
    return null;
  } finally {
    if (video) {
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Resolve once the element fires `event`, or reject when it fires `error` instead. */
function onceOrThrow(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    const onOk = () => { done(); resolve(); };
    const onErr = () => { done(); reject(new Error(`video ${event} failed`)); };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/** Reject if the promise has not settled within `ms`, so a stuck decode cannot hang a send. */
function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('video poster extraction timed out')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
