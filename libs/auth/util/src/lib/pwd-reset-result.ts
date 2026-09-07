/**
 * Outcome of a password-reset confirmation (the /auth/confirm page).
 *
 * The page used to collapse every failure into one generic "link is invalid or expired"
 * message (SCS-A8): a member whose link was already used, whose link had expired, or who
 * simply typed too short a password all saw the same sentence and kept retrying the same
 * dead link. The reasons below are what the UI needs to say something actionable.
 *
 * `weakPassword` and `network` are *retryable* — the form stays open. The others are
 * terminal for this link: the only way forward is a fresh reset mail.
 */
export type PwdResetFailure =
  | 'expired'       // auth/expired-action-code — link too old
  | 'used'          // auth/invalid-action-code — link already consumed (or malformed)
  | 'noAccount'     // auth/user-not-found | auth/user-disabled
  | 'weakPassword'  // auth/weak-password — retryable, keep the form open
  | 'network'       // auth/network-request-failed — retryable, keep the form open
  | 'unknown';      // anything else

export type PwdResetResult =
  | { ok: true; email: string }
  | { ok: false; reason: PwdResetFailure };

/** Failures the user can recover from without requesting a new link. */
const RETRYABLE: readonly PwdResetFailure[] = ['weakPassword', 'network'];

export function isRetryablePwdResetFailure(reason: PwdResetFailure): boolean {
  return RETRYABLE.includes(reason);
}

/**
 * Map a Firebase Auth rejection from verifyPasswordResetCode/confirmPasswordReset onto a
 * PwdResetFailure. Reads `code` off the thrown value without assuming it is a FirebaseError —
 * the SDK is not the only thing that can reject here (an offline device rejects with a plain
 * object), and an unrecognised shape must still yield a usable message.
 */
export function toPwdResetFailure(ex: unknown): PwdResetFailure {
  const code = typeof ex === 'object' && ex !== null && 'code' in ex ? String((ex as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/expired-action-code':     return 'expired';
    case 'auth/invalid-action-code':     return 'used';
    case 'auth/user-not-found':
    case 'auth/user-disabled':           return 'noAccount';
    case 'auth/weak-password':           return 'weakPassword';
    case 'auth/network-request-failed':  return 'network';
    default:                             return 'unknown';
  }
}
