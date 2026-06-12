import { effect, signal, WritableSignal } from '@angular/core';

/**
 * Options for {@link persistedSignal}.
 */
export interface PersistedSignalOptions {
  /** Debounce window (ms) before a value is written to localStorage. Default 250. */
  debounceMs?: number;
  /** Time-to-live (ms). Reads older than this return the initialValue. Default 30 days. */
  ttlMs?: number;
}

/** Stored wrapper enabling TTL invalidation and a future schema-migration path. */
interface Envelope<T> {
  v: T;
  t: number;
}

/**
 * Read and validate a persisted value from localStorage.
 * Returns `initialValue` when the key is missing, the entry is corrupted, the entry
 * is older than `ttlMs`, or localStorage is unavailable (SSR). Pure & side-effect free
 * apart from the read — exported for unit testing.
 */
export function readPersisted<T>(key: string, initialValue: T, ttlMs: number): T {
  if (typeof localStorage === 'undefined') return initialValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialValue;
    const env = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - env.t < ttlMs) return env.v;
  } catch { /* corrupted entry — ignore, fall back to initialValue */ }
  return initialValue;
}

/**
 * Write a TTL-stamped value to localStorage. No-op (swallows) when localStorage is
 * unavailable or the quota is exceeded. Exported for unit testing.
 */
export function writePersisted<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now() } satisfies Envelope<T>));
  } catch { /* quota exceeded — drop */ }
}

/**
 * A WritableSignal whose value is persisted to localStorage (debounced) and restored
 * on creation. Built for small, high-value UI state that should survive an iOS
 * reload-on-resume — chat scroll position, last-read marker, last-visited section,
 * accordion expand state, etc. See docs/16_spec-pwa-caching.md §11.4.
 *
 * Semantics:
 * - Read happens once, synchronously, at creation. Construct the signal in a stable
 *   place (component constructor or store `withProps`) — never inside a `computed`.
 * - Writes are debounced (default 250 ms) and TTL-stamped (default 30 days).
 * - A `visibilitychange → hidden` listener flushes any pending write so iOS doesn't
 *   evict the page mid-debounce. This composes with other visibilitychange handlers.
 * - All storage access is guarded and try/catched: missing/corrupted/quota-exceeded
 *   entries degrade silently to the initialValue rather than throwing.
 */
export function persistedSignal<T>(
  key: string,
  initialValue: T,
  opts: PersistedSignalOptions = {},
): WritableSignal<T> {
  const { debounceMs = 250, ttlMs = 30 * 24 * 60 * 60 * 1000 } = opts;

  const sig = signal<T>(readPersisted(key, initialValue, ttlMs));
  let pending: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    const value = sig();
    if (typeof localStorage === 'undefined') return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      writePersisted(key, value);
      pending = undefined;
    }, debounceMs);
  });

  // Flush on backgrounding so iOS doesn't evict the page mid-debounce.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && pending) {
        clearTimeout(pending);
        pending = undefined;
        writePersisted(key, sig());
      }
    });
  }

  return sig;
}
