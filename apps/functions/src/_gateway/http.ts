// apps/functions/src/_gateway/http.ts
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB response cap

export interface GatewayFetchOptions extends AxiosRequestConfig {
  timeoutMs?: number;
  maxRetries?: number;
  maxBytes?: number;
}

/** A transport failure (no response) or a 429/5xx is worth retrying; a 4xx is
 *  the caller's fault and must not be retried. */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000); // 1s, 2s, capped 4s
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * axios wrapper with timeout, bounded retry (exponential backoff), a hard
 * response-size cap, and a capped redirect count. Callers pass method/url/
 * headers/data via AxiosRequestConfig. Never logs the raw error.
 */
export async function gatewayFetch<T = unknown>(
  url: string,
  opts: GatewayFetchOptions = {},
): Promise<AxiosResponse<T>> {
  const { timeoutMs, maxRetries, maxBytes, ...axiosCfg } = opts;
  const maxAttempts = (maxRetries ?? DEFAULT_MAX_RETRIES) + 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await axios.request<T>({
        url,
        timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxContentLength: maxBytes ?? DEFAULT_MAX_BYTES,
        maxBodyLength: maxBytes ?? DEFAULT_MAX_BYTES,
        maxRedirects: 3,
        ...axiosCfg,
      });
    } catch (err: unknown) {
      lastErr = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (attempt < maxAttempts - 1 && isRetryableStatus(status)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
