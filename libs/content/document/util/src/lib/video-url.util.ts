/** One album video as returned by the `signVideoUrls` callable (spec 1.82 §5). */
export interface SignedVideo {
  key: string;
  posterUrl: string;
  playback: { kind: 'mp4'; url: string };
  downloadUrl?: string;
}

/** Re-sign this long before the window ends, so a click never gets a URL that dies mid-play. */
export const RESIGN_MARGIN_MS = 5 * 60 * 1000;

export function needsResign(expires: number | undefined, nowMs: number): boolean {
  return expires === undefined || nowMs >= expires - RESIGN_MARGIN_MS;
}

/**
 * Milliseconds until the visible tiles must be re-signed: RESIGN_MARGIN_MS before `expires`,
 * never negative (an already-stale window re-signs at once, exactly once), undefined without a window.
 */
export function resignDelay(expires: number | undefined, nowMs: number): number | undefined {
  if (expires === undefined) return undefined;
  return Math.max(0, expires - RESIGN_MARGIN_MS - nowMs);
}

/** Keys to send to the signer: all of them once the window is stale, else only the unsigned ones. */
export function missingKeys(keys: string[], signed: Record<string, SignedVideo>, expires: number | undefined, nowMs: number): string[] {
  const unique = [...new Set(keys.filter(Boolean))];
  return needsResign(expires, nowMs) ? unique : unique.filter(k => !signed[k]);
}

/**
 * Fold a sign response into the live state. Same window → merge; newer window → old signatures are
 * dead, start over; older window (a late response) → drop it.
 */
export function mergeSigned(
  current: Record<string, SignedVideo>,
  currentExpires: number | undefined,
  videos: SignedVideo[],
  resExpires: number,
): { signed: Record<string, SignedVideo>; expires: number | undefined } {
  const incoming = Object.fromEntries(videos.map(v => [v.key, v]));
  if (currentExpires !== undefined && resExpires < currentExpires) return { signed: current, expires: currentExpires };
  if (resExpires === currentExpires) return { signed: { ...current, ...incoming }, expires: currentExpires };
  return { signed: incoming, expires: resExpires };
}

/**
 * Keys a sign call has ANSWERED (signed or not) in the current window. A new window invalidates
 * the earlier answers, so the set starts over; within a window it only grows.
 */
export function settleKeys(current: ReadonlySet<string>, keys: string[], newWindow: boolean): ReadonlySet<string> {
  return new Set(newWindow ? keys : [...current, ...keys]);
}

/** `signVideoUrls` signs at most this many keys per call (MAX_VIDEO_KEYS in the function). */
export const MAX_SIGN_KEYS = 100;

/** `keys` in consecutive chunks of at most `size` (a non-positive size counts as 1). */
export function chunkKeys(keys: readonly string[], size = MAX_SIGN_KEYS): string[][] {
  const n = Math.max(1, Math.floor(size));
  const out: string[][] = [];
  for (let i = 0; i < keys.length; i += n) out.push(keys.slice(i, i + n));
  return out;
}
