import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';

/**
 * Log levels supported by matrix-js-sdk's internal logger (it uses `loglevel` under the hood).
 * `silent` disables all SDK logging; `debug`/`trace` are very chatty (every HTTP call is logged).
 */
export type MatrixLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export const MATRIX_LOG_LEVELS: readonly MatrixLogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

/**
 * Default SDK log level. Deliberately NOT `debug`: at debug level matrix-js-sdk logs every
 * request/response (e.g. "FetchHttpApi: --> PUT …/typing/…"), flooding the browser console.
 */
export const DEFAULT_MATRIX_LOG_LEVEL: MatrixLogLevel = 'warn';

const STORAGE_KEY = 'bk2.matrixLogLevel';

function isMatrixLogLevel(value: string | null): value is MatrixLogLevel {
  return value !== null && (MATRIX_LOG_LEVELS as readonly string[]).includes(value);
}

function readStoredLevel(): MatrixLogLevel | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isMatrixLogLevel(stored) ? stored : undefined;
}

/** The currently configured level: a stored admin override, or {@link DEFAULT_MATRIX_LOG_LEVEL}. */
export function getMatrixLogLevel(): MatrixLogLevel {
  return readStoredLevel() ?? DEFAULT_MATRIX_LOG_LEVEL;
}

/**
 * Set the matrix-js-sdk global logger level. The MatrixClient uses this logger, so this controls
 * all SDK console noise (FetchHttpApi request/response lines, sync state, …). The choice is
 * persisted to localStorage so it survives page reloads.
 */
export function setMatrixLogLevel(level: MatrixLogLevel, persist = true): void {
  // matrixLogger is a loglevel logger at runtime; its `setLevel` isn't on the exported type.
  (matrixLogger as unknown as { setLevel(level: MatrixLogLevel): void }).setLevel(level);
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, level);
  }
}

/** Apply the configured level (stored override or default). Call once at startup, before the client logs. */
export function initMatrixLogLevel(): void {
  setMatrixLogLevel(getMatrixLogLevel(), false);
}
