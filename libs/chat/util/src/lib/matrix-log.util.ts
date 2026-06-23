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

/** Minimal shape of a runtime loglevel logger — `setLevel`/`getChild` aren't on the exported type. */
type LevelLogger = {
  setLevel(level: MatrixLogLevel, persist?: boolean): void;
  getChild(namespace: string): LevelLogger;
};

/**
 * matrix-js-sdk gives every child logger its OWN level and forces it to DEBUG at creation
 * (getPrefixedLogger → `setLevel(DEBUG, false)`). loglevel loggers don't inherit a parent's
 * level, so setting the root logger alone leaves per-room loggers (e.g. `[MatrixRTCSession …]`,
 * which spams "No membership changes detected …" at debug) chatty. To actually control the SDK
 * noise we must set the level on every logger individually and intercept child creation so future
 * loggers inherit the configured level. We track every logger we've wired up here.
 */
const trackedLoggers = new Set<LevelLogger>();
const PATCH_FLAG = '__bk2LevelPatched';

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
 * Track `log` and wrap its `getChild` so any child it creates is also tracked, set to the current
 * level, and itself patched (covering grandchildren). Idempotent — guarded by {@link PATCH_FLAG}.
 */
function patchLogger(log: LevelLogger): void {
  const flagged = log as unknown as Record<string, unknown>;
  if (flagged[PATCH_FLAG]) return;
  flagged[PATCH_FLAG] = true;
  trackedLoggers.add(log);

  const originalGetChild = log.getChild?.bind(log);
  if (!originalGetChild) return;
  log.getChild = (namespace: string): LevelLogger => {
    const child = originalGetChild(namespace);
    patchLogger(child);
    // Override the SDK's per-child DEBUG default with the configured level.
    child.setLevel(getMatrixLogLevel(), false);
    return child;
  };
}

/**
 * Set the matrix-js-sdk log level on every tracked logger (root + all child loggers). The choice
 * is persisted to localStorage so it survives reloads and so child loggers created later (which
 * read {@link getMatrixLogLevel}) pick it up too.
 */
export function setMatrixLogLevel(level: MatrixLogLevel, persist = true): void {
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, level);
  }
  for (const log of trackedLoggers) {
    log.setLevel(level, false);
  }
}

/**
 * Apply the configured level (stored override or default) and install the child-logger
 * interception. Call once at startup, before the client logs.
 */
export function initMatrixLogLevel(): void {
  patchLogger(matrixLogger as unknown as LevelLogger);
  setMatrixLogLevel(getMatrixLogLevel(), false);
}
