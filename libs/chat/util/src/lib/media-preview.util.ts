/**
 * Edge length (px) of the preview the message list asks the homeserver for. Synapse scales
 * the original down to fit inside this box and answers with a ~100 KB JPEG/PNG, where the
 * original phone photo is 7–10 MB. The full original is only fetched when somebody opens it.
 */
export const IMAGE_PREVIEW_EDGE_PX = 800;

/**
 * Below this size the original IS the preview — asking for a thumbnail would cost a
 * server-side resize and save nothing on the wire.
 */
const IMAGE_PREVIEW_MIN_BYTES = 256 * 1024;

/**
 * Raster formats Synapse thumbnails reliably. Deliberately excluded: GIF (the thumbnail is a
 * single still frame, so an animation would stop moving) and SVG (not thumbnailable at all).
 */
const PREVIEWABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

/**
 * Should the message list show the homeserver's scaled preview of this image instead of
 * downloading the original?
 *
 * The chat used to download every image in full before it could show anything. On a phone a
 * 9 MB photo takes long enough to be cut off by a backgrounded tab or a network switch, and the
 * tile then showed "image unavailable" until the next cold start.
 *
 * @param mimetype the event's `info.mimetype` (or the type implied by the filename)
 * @param sizeBytes the event's `info.size`; undefined when the sender did not record it
 */
export function shouldUseImagePreview(mimetype: string | undefined, sizeBytes: number | undefined): boolean {
  const type = (mimetype ?? '').split(';')[0].trim().toLowerCase();
  if (!PREVIEWABLE_IMAGE_TYPES.has(type)) return false;
  return sizeBytes === undefined || sizeBytes >= IMAGE_PREVIEW_MIN_BYTES;
}

/**
 * Automatic retries of an attachment whose download failed: after 5 s, 20 s and 60 s. After
 * that the tile waits for the app to come back to the foreground, the device to come back
 * online, or a tap on the tile.
 */
export const MEDIA_RETRY_DELAYS_MS: readonly number[] = [5_000, 20_000, 60_000];

/** Delay before automatic retry number `attempt` (0-based), or undefined when none is left. */
export function mediaRetryDelayMs(attempt: number): number | undefined {
  if (attempt < 0) return undefined;
  return MEDIA_RETRY_DELAYS_MS[attempt];
}
