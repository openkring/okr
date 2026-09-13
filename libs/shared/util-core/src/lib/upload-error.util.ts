/**
 * Turn whatever a Firebase Storage upload rejects with into something a human — and Sentry —
 * can act on.
 *
 * The reason this exists: the upload paths used to report failures as `JSON.stringify(ex)`,
 * and a `FirebaseError` stringifies to `{}`. Its `code`, `message`, `name` and
 * `serverResponse` are all NON-ENUMERABLE (they come off the Error prototype chain and the
 * SDK's own `Object.defineProperty` calls), so `JSON.stringify` sees an object with no own
 * enumerable keys and emits an empty literal. Every upload failure therefore logged the
 * exact same content-free line, which is why no upload bug in this app was ever diagnosable
 * from a log. Read the fields explicitly instead.
 *
 * The codes that actually occur on the album/document upload path:
 * - `storage/unauthorized`      — storage.rules denied it, OR the App Check token was stale
 *                                 (the two are indistinguishable from the client; see
 *                                 `UploadService.uploadFiles`, which re-attests before
 *                                 uploading so the second cause is ruled out by the time a
 *                                 user sees this).
 * - `storage/quota-exceeded`    — bucket is full.
 * - `storage/retry-limit-exceeded` — the connection died mid-upload; the classic mobile case.
 * - `storage/canceled`          — the user (or a teardown) aborted the task.
 * - `storage/unauthenticated`   — the Firebase Auth session expired.
 */
export interface UploadErrorInfo {
  /** The Firebase error code, e.g. `storage/unauthorized`, or `unknown` when there is none. */
  code: string;
  /** The human-readable message, or a last-resort stringification. */
  message: string;
}

export function describeUploadError(ex: unknown): UploadErrorInfo {
  if (typeof ex === 'string') return { code: 'unknown', message: ex };
  if (!ex || typeof ex !== 'object') return { code: 'unknown', message: String(ex) };

  const candidate = ex as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof candidate.code === 'string' && candidate.code ? candidate.code : 'unknown';
  const message = typeof candidate.message === 'string' && candidate.message
    ? candidate.message
    : typeof candidate.name === 'string' && candidate.name
      ? candidate.name
      : String(ex);
  return { code, message };
}

/**
 * `true` when the failure is one a second attempt could plausibly survive — a stale App Check
 * token or a dropped mobile connection. A rules denial is NOT retryable and neither is a full
 * bucket: retrying those only costs the user another wait before the same red cross.
 */
export function isRetryableUploadError(code: string): boolean {
  return code === 'storage/retry-limit-exceeded'
    || code === 'storage/unauthorized'
    || code === 'storage/unknown';
}
