/**
 * Thrown before an upload starts when the file exceeds the homeserver's `m.upload.size`.
 *
 * A distinct type rather than a plain Error because the callers must tell it apart from a
 * genuine failure: this one is the user's to fix, so it gets a specific toast naming the
 * limit and does NOT go to Sentry. Everything else stays a silent-failure report.
 */
export class UploadTooLargeError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly size: number,
    public readonly limit: number
  ) {
    super(`${fileName} is ${size} bytes, over the homeserver limit of ${limit} bytes`);
    this.name = 'UploadTooLargeError';
    // Restores the prototype chain broken by extending a built-in under ES5 down-levelling,
    // without which `instanceof` — the whole point of this class — silently returns false.
    Object.setPrototypeOf(this, UploadTooLargeError.prototype);
  }
}

/** True if the given value is an UploadTooLargeError, safe across bundle boundaries. */
export function isUploadTooLargeError(error: unknown): error is UploadTooLargeError {
  return error instanceof UploadTooLargeError
    || (error as Error | null)?.name === 'UploadTooLargeError';
}
