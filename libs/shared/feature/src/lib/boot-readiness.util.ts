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
  /** The categories resource is still in flight. */
  categoriesLoading: boolean;
  /** The readiness watchdog fired: an authenticated user's `users/{uid}` read never returned. */
  readinessTimedOut: boolean;
  /** The auth-restore watchdog fired: `onAuthStateChanged` never emitted. */
  authRestoreTimedOut: boolean;
};

/** Which gate is still holding navigation. Only meaningful while the app is not ready. */
export type BootGate = 'auth-restore' | 'user-doc' | 'categories' | 'unknown';

/**
 * Name the open gate for the stall report. From the outside every gate looks the same — a
 * spinner — so without this the report would say "slow" and nothing more.
 */
export function openBootGate(state: BootState): BootGate {
  if (state.phase === 'restoring') return 'auth-restore';
  if (state.phase === 'signedIn' && !state.hasCurrentUser) return 'user-doc';
  if (state.categoriesLoading) return 'categories';
  return 'unknown';
}

/**
 * Whether to replace the endless boot spinner with the "slow connection — reload" panel.
 *
 * Two stalls qualify, and only after their watchdog has fired:
 *  - an authenticated user whose UserModel never loaded (`readinessTimedOut`), and
 *  - auth that never settled at all (`authRestoreTimedOut`).
 *
 * A fast missing-doc or permission-denied read settles readiness WITHOUT firing a watchdog, so
 * that genuinely-broken-account case never shows the (misleading) slow-connection message.
 * Both conditions are self-healing: if the pending read or the auth restore finally resolves,
 * the inputs change and this goes back to false.
 */
export function isDegradedBoot(state: BootState): boolean {
  if (state.authRestoreTimedOut && state.phase === 'restoring') return true;
  return state.readinessTimedOut && state.phase === 'signedIn' && !state.hasCurrentUser;
}
