/** What went wrong with a passkey ceremony or callable, reduced to what the UI reacts to. */
export type PasskeyErrorKind = 'cancelled' | 'exists' | 'reauth' | 'unsupported' | 'error';

function nameOf(err: unknown): string {
  if (typeof err !== 'object' || err === null) return '';
  const name = (err as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

/**
 * Map a WebAuthn DOM error (possibly wrapped by @simplewebauthn/browser's WebAuthnError, which keeps
 * the original on `.cause`) or a Cloud Functions error onto a PasskeyErrorKind.
 */
export function passkeyErrorKind(err: unknown): PasskeyErrorKind {
  if (typeof err !== 'object' || err === null) return 'error';
  const cause = (err as { cause?: unknown }).cause;
  for (const name of [nameOf(err), nameOf(cause)]) {
    if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
    if (name === 'InvalidStateError') return 'exists';
    if (name === 'NotSupportedError') return 'unsupported';
  }
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === 'functions/already-exists') return 'exists';
  if (code === 'functions/failed-precondition' && message === 'recent-login-required') return 'reauth';
  return 'error';
}
