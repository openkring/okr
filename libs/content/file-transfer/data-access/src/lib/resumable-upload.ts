/**
 * Resumable upload to a GCS resumable-session URL (spec 1.115). Plain TypeScript, no Angular, so it
 * is unit-testable with a stubbed `fetchFn`.
 *
 * Protocol: PUT chunks with `Content-Range: bytes a-b/total`; `308` + `Range: bytes=0-n` means
 * "continue at n+1" (no Range header = nothing persisted yet); `200`/`201` = finished. After a
 * network error or 5xx/429 we ask the session where it is (`Content-Range: bytes * /total`) and
 * resume from there, never blindly from 0.
 *
 * The bucket CORS must expose the `Range` response header, otherwise a browser cannot read it.
 */

/** 8 MiB, a multiple of the 256 KiB granularity GCS requires for non-final chunks. */
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 500;

export interface ResumableUploadOptions {
  chunkBytes?: number;
  /** Retries per chunk (reset whenever a chunk makes progress). */
  maxRetries?: number;
  fetchFn?: typeof fetch;
  /** Base backoff in ms (doubles per attempt, capped at 8 s). */
  retryDelayMs?: number;
  signal?: AbortSignal;
}

class RetryableError extends Error {}

function abortError(): Error {
  const e = new Error('Upload aborted');
  e.name = 'AbortError';
  return e;
}

/** `bytes=0-1234` → 1235 (next offset to send); missing header → 0. */
function nextOffset(res: Response): number {
  const range = res.headers.get('Range');
  const m = range ? /bytes=0-(\d+)/.exec(range) : null;
  return m ? Number(m[1]) + 1 : 0;
}

const isDone = (status: number): boolean => status === 200 || status === 201;
const isRetryable = (status: number): boolean => status === 429 || status >= 500;

export async function uploadResumable(
  sessionUrl: string,
  file: Blob,
  onProgress: (sent: number) => void,
  opts: ResumableUploadOptions = {},
): Promise<void> {
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const signal = opts.signal;
  const size = file.size;

  const put = async (contentRange: string, body?: Blob): Promise<Response> => {
    try {
      return await fetchFn(sessionUrl, { method: 'PUT', headers: { 'Content-Range': contentRange }, body, signal });
    } catch (e) {
      if (signal?.aborted) throw abortError();
      throw new RetryableError(String(e));
    }
  };
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  /** Ask the session how much it has. Resolves to the next offset, or 'done'. */
  const queryStatus = async (): Promise<number | 'done'> => {
    const res = await put(`bytes */${size}`);
    if (isDone(res.status)) return 'done';
    if (res.status === 308) return nextOffset(res);
    if (isRetryable(res.status)) throw new RetryableError(`status query ${res.status}`);
    throw new Error(`Upload status query failed: ${res.status}`);
  };

  let offset = 0;
  let failures = 0;
  let needStatus = false;

  while (true) {
    if (signal?.aborted) throw abortError();
    try {
      if (needStatus) {
        const st = await queryStatus();
        if (st === 'done') { onProgress(size); return; }
        offset = st;
        onProgress(offset);
        needStatus = false;
      }
      const end = Math.min(offset + chunkBytes, size);
      const res = size === 0
        ? await put('bytes */0', file)
        : await put(`bytes ${offset}-${end - 1}/${size}`, file.slice(offset, end));
      if (isDone(res.status)) { onProgress(size); return; }
      if (res.status === 308) {
        const next = nextOffset(res);
        if (next > offset) failures = 0;
        offset = next;
        onProgress(offset);
        continue;
      }
      if (isRetryable(res.status)) throw new RetryableError(`chunk ${res.status}`);
      throw new Error(`Upload failed: ${res.status}`);
    } catch (e) {
      if (!(e instanceof RetryableError)) throw e;
      failures++;
      if (failures > maxRetries) throw new Error(`Upload failed after ${maxRetries} retries: ${e.message}`);
      await sleep(Math.min(baseDelay * 2 ** (failures - 1), 8000));
      needStatus = true;
    }
  }
}
