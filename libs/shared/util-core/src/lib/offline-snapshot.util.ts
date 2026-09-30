import { concat, defer, filter, MonoTypeOperatorFunction, Observable, of, tap } from 'rxjs';

/*----------------------- OFFLINE SNAPSHOT ------------------------------------*/
/**
 * A device-local copy of the last value a live stream delivered, used to seed that stream when
 * the app is opened WITHOUT network (see the `offline` skill).
 *
 * Why: on iOS/Safari/Firefox Firestore runs on an in-memory cache, so a cold start offline has
 * nothing to show — `users/{uid}` never loads, every store gated on the current user stays empty,
 * the menu and the tenant config fall back to defaults. A small localStorage snapshot of those
 * few shell documents makes the app usable again.
 *
 * Only a cold start while `navigator.onLine === false` uses the snapshot. Online, the stream is
 * passed through unchanged and merely persisted, so stale roles or config can never override a
 * server answer.
 */
const OFFLINE_SNAPSHOT_PREFIX = 'okr.offline.';

/** True when the browser reports no network connection (false outside a browser). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function readOfflineSnapshot<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(OFFLINE_SNAPSHOT_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw) as T;
  } catch {
    return undefined;   // no localStorage (SSR, blocked site data) or a corrupt entry
  }
}

export function writeOfflineSnapshot<T>(key: string, value: T): void {
  try {
    localStorage.setItem(OFFLINE_SNAPSHOT_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota exceeded, private mode, blocked site data: the snapshot is a convenience */
  }
}

/**
 * Remove every snapshot whose key starts with `keyPrefix` (all snapshots when omitted).
 * Call on logout with the user scope so the next person on a shared device sees nothing of it.
 */
export function clearOfflineSnapshots(keyPrefix = ''): void {
  try {
    const prefix = OFFLINE_SNAPSHOT_PREFIX + keyPrefix;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    /* no localStorage */
  }
}

/** Default emptiness test: `undefined`, `null` or an empty array carries no information. */
export function isEmptySnapshotValue<T>(value: T | undefined): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

/**
 * Persist every non-empty value of the stream under `key`. If the browser is offline when the
 * stream is subscribed and a snapshot exists, emit the snapshot first and suppress the empty
 * values Firestore reports for an uncached query while the browser stays offline.
 *
 * @param key snapshot key, scoped by the caller (e.g. `user.<uid>`, `appConfig.<tenantId>`)
 * @param isEmpty which live values count as "nothing known" (default: undefined/null/[])
 */
export function withOfflineSnapshot<T>(
  key: string,
  isEmpty: (value: T) => boolean = isEmptySnapshotValue,
): MonoTypeOperatorFunction<T> {
  return (source: Observable<T>) => defer(() => {
    const live$ = source.pipe(
      tap(value => { if (!isEmpty(value)) writeOfflineSnapshot(key, value); }),
    );
    const snapshot = readOfflineSnapshot<T>(key);
    if (!isBrowserOffline() || snapshot === undefined) return live$;
    return concat(
      of(snapshot),
      live$.pipe(filter(value => !isEmpty(value) || !isBrowserOffline())),
    );
  });
}
