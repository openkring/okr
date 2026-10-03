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

/** Keys to send to the signer: all of them once the window is stale, else only the unsigned ones. */
export function missingKeys(keys: string[], signed: Record<string, SignedVideo>, expires: number | undefined, nowMs: number): string[] {
  const unique = [...new Set(keys.filter(Boolean))];
  return needsResign(expires, nowMs) ? unique : unique.filter(k => !signed[k]);
}
