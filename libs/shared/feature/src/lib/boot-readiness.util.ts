/**
 * The boot-readiness decisions, as pure functions.
 *
 * They live here rather than inline in `AppStore` because they encode an invariant that was
 * broken for a long time without anyone noticing: EVERY way the boot can stall must have an
 * upper bound. The auth-restore window had none — `fbUser === undefined` made `isDataReady()`
 * return false while the readiness watchdog refused to arm (it arms only once `fbUser` is
 * truthy), so `isAppReady` could stay false forever and the user sat on the boot spinner until
 * they reloaded by hand. A comment cannot keep that from coming back; the spec next to this
 * file can.
 */

/**
 * Firebase auth as the store sees it. `fbUser` is tri-state and the three states mean genuinely
 * different things — conflating `undefined` ("we do not know yet") with `null` ("signed out")
 * is what let an unbounded wait hide behind a falsy check.
 */
export type AuthPhase = 'restoring' | 'signedOut' | 'signedIn';

export function authPhase(fbUser: unknown): AuthPhase {
  if (fbUser === undefined) return 'restoring';
  if (fbUser === null) return 'signedOut';
  return 'signedIn';
}

export type BootState = {
  phase: AuthPhase;
  /** The UserModel for the signed-in user has loaded. */
  hasCurrentUser: boolean;
  /**
   * The `users/{uid}` read has settled (it is no longer loading) — with or without a UserModel.
   * Settled AND no UserModel is the broken session: a missing doc, a denied read, or a corrupted
   * local Firestore cache answering "no such document".
   */
  userReadSettled: boolean;
  /** The categories resource is still in flight. */
  categoriesLoading: boolean;
  /** The readiness watchdog fired: an authenticated user's `users/{uid}` read never returned. */
  readinessTimedOut: boolean;
  /** The auth-restore watchdog fired: `onAuthStateChanged` never emitted. */
  authRestoreTimedOut: boolean;
};

/**
 * Which gate is still holding navigation. Only meaningful while the app is not ready.
 *
 * `session-restore`, not `auth-restore`: the gate name travels to Sentry as an extra, and
 * Sentry's server-side scrubber replaces any value containing "auth" with "[Filtered]"
 * (seen on SCS-AQ). Tags survive scrubbing, extras do not.
 */
export type BootGate = 'session-restore' | 'user-doc' | 'categories' | 'unknown';

/**
 * Name the open gate for the stall report. From the outside every gate looks the same — a
 * spinner — so without this the report would say "slow" and nothing more.
 */
export function openBootGate(state: BootState): BootGate {
  if (state.phase === 'restoring') return 'session-restore';
  if (state.phase === 'signedIn' && !state.hasCurrentUser) return 'user-doc';
  if (state.categoriesLoading) return 'categories';
  return 'unknown';
}

/**
 * Whether to replace the endless boot spinner with the "the app could not finish starting —
 * reload" panel.
 *
 * Three stalls qualify:
 *  - auth that never settled at all, once its watchdog fired (`authRestoreTimedOut`);
 *  - an authenticated user whose UserModel read never returned, once its watchdog fired
 *    (`readinessTimedOut`);
 *  - an authenticated user whose UserModel read RETURNED, but empty (`userReadSettled`).
 *
 * The third needs no watchdog because waiting cannot fix it. It used to be let through
 * silently: navigation opened, the role guards saw no user and treated the signed-in user as a
 * visitor (`/public/welcome`), and the menu — gated on `isUserSessionReady` — showed its spinner
 * forever, with no message and no way out but a reload nobody suggested (2026-10-07, a corrupted
 * local Firestore cache that answered "no such document" for `users/owner_scs`).
 *
 * All three are self-healing: if the pending read or the auth restore finally resolves (the
 * user-doc listener keeps retrying a denial, see FirestoreService), the inputs change and this
 * goes back to false.
 */
export function isDegradedBoot(state: BootState): boolean {
  if (state.authRestoreTimedOut && state.phase === 'restoring') return true;
  if (state.phase !== 'signedIn' || state.hasCurrentUser) return false;
  return state.readinessTimedOut || state.userReadSettled;
}
