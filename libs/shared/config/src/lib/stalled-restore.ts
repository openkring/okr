/**
 * The way out of a session restore that hangs on an expired login (SCS-AZ, BKA-8).
 *
 * On Safari, iOS (every iOS browser and the native shell) and Firefox the session lives in
 * localStorage only (see usesLocalStorageOnlySession). When its ID token has expired, Firebase
 * Auth must renew it over the network before onAuthStateChanged emits, and on WebKit that
 * renewal can hang far past the restore watchdog. The user gets the "could not finish
 * starting — try again" panel, reloads, finds the same expired session, and hangs again: SCS-AZ
 * shows the same device reporting two or three times within half a minute.
 *
 * So the watchdog leaves a note when it fires on an expired session, and the NEXT boot — the
 * user's "try again" — drops that expired session before Auth starts. Auth then settles at once
 * as signed out and the login page appears. The cost is one sign-in, for a user who could not
 * get in at all.
 *
 * Only the expired case is touched: a still-valid session needs no network to restore, so a
 * stall there is something else, and dropping it would not be justified.
 */

/** localStorage key of the note left by a stalled restore. */
export const STALLED_RESTORE_NOTE_KEY = 'okr:stalledExpiredRestore';

/** A note older than this belongs to an earlier visit, not to the user's "try again". */
export const STALLED_RESTORE_NOTE_TTL_MS = 10 * 60_000;

/** Minimal Storage surface, so tests can pass a plain map. */
export type NoteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The localStorage key Firebase Auth persists the current user under (default app). */
export function firebaseSessionKey(apiKey: string): string {
  return `firebase:authUser:${apiKey}:[DEFAULT]`;
}

function defaultStorage(): NoteStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined; // Safari with site data blocked throws on mere access
  }
}

/** Called by the restore watchdog when it fires while an expired session was being restored. */
export function noteStalledExpiredRestore(storage = defaultStorage(), nowMs = Date.now()): void {
  try {
    storage?.setItem(STALLED_RESTORE_NOTE_KEY, String(nowMs));
  } catch {
    // Quota or blocked storage: no note, no escape — the panel's reload still works as before.
  }
}

/** Called once the session settled either way: the restore did not hang (any more). */
export function clearStalledRestoreNote(storage = defaultStorage()): void {
  try {
    storage?.removeItem(STALLED_RESTORE_NOTE_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * Before Auth starts: if the previous boot stalled restoring an expired session, and the stored
 * session is still expired, remove it so this boot starts signed out. Consumes the note either
 * way. Never throws.
 *
 * @returns true when a session was dropped
 */
export function dropExpiredSessionAfterStall(apiKey: string, storage = defaultStorage(), nowMs = Date.now()): boolean {
  if (!storage || !apiKey) return false;
  try {
    const note = Number(storage.getItem(STALLED_RESTORE_NOTE_KEY));
    if (!note) return false;
    storage.removeItem(STALLED_RESTORE_NOTE_KEY);
    if (nowMs - note > STALLED_RESTORE_NOTE_TTL_MS) return false;

    const key = firebaseSessionKey(apiKey);
    const raw = storage.getItem(key);
    if (!raw) return false;
    const expiresAt = (JSON.parse(raw) as { stsTokenManager?: { expirationTime?: unknown } })?.stsTokenManager?.expirationTime;
    if (typeof expiresAt !== 'number' || expiresAt > nowMs) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
