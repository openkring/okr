/**
 * Why a sign-in attempt failed.
 *
 * The login toast used to say the same sentence — "check your email and password" — for a
 * locked account, a typo in the address, a rate limit and an offline phone alike. A member
 * who is rate-limited then keeps retrying, which is exactly what extends the lockout
 * (observed on SCS-A8's device: six identical invalid-credential failures in a row).
 */
export type LoginFailure =
  | 'wrongCredentials'  // auth/invalid-credential | auth/wrong-password | auth/user-not-found
  | 'invalidEmail'      // auth/invalid-email
  | 'disabled'          // auth/user-disabled
  | 'tooManyAttempts'   // auth/too-many-requests
  | 'network'           // auth/network-request-failed
  | 'unknown';

/**
 * Map a Firebase Auth rejection from signInWithEmailAndPassword/signInWithCustomToken onto a
 * LoginFailure. Reads `code` defensively — an offline device can reject with something that
 * is not a FirebaseError at all, and an unrecognised shape must still yield a usable message.
 *
 * Note that Firebase deliberately collapses "no such user" and "wrong password" into
 * auth/invalid-credential (email-enumeration protection). We keep that collapse: telling a
 * visitor which half was wrong would hand them a membership-list oracle.
 */
export function toLoginFailure(ex: unknown): LoginFailure {
  const code = typeof ex === 'object' && ex !== null && 'code' in ex ? String((ex as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':          return 'wrongCredentials';
    case 'auth/invalid-email':           return 'invalidEmail';
    case 'auth/user-disabled':           return 'disabled';
    case 'auth/too-many-requests':       return 'tooManyAttempts';
    case 'auth/network-request-failed':  return 'network';
    default:                             return 'unknown';
  }
}
