/**
 * The wake watchdog's "is the app stuck?" decision, as a pure function.
 *
 * The health probe used to collapse every failed server read into "stuck", so a read the backend
 * actively refused looked the same as a frozen stack. A refusal is the opposite of a hang: the
 * network, App Check client, auth and the Firestore stream all answered — and a reload cannot turn
 * a "no" into a "yes". SCS-CS: an Android emulator that fails Play Integrity had every read denied
 * and was reloaded on every wake (69 times), without ever healing.
 */

/**
 * Firestore codes that do NOT prove the backend answered: the client gave up (offline, backoff,
 * deadline) or was torn down. Everything else is a reply from the server.
 */
const NO_ANSWER_CODES = new Set(['unavailable', 'deadline-exceeded', 'cancelled', 'unknown']);

/** Outcome of one bounded health read: it resolved, timed out, or rejected with this error. */
export type HealthProbeOutcome =
  | { kind: 'ok' }
  | { kind: 'timeout' }
  | { kind: 'error'; error: unknown };

/** True when the app looks stuck and a recovery step (network reset, then reload) is warranted. */
export function isStuck(outcome: HealthProbeOutcome): boolean {
  if (outcome.kind === 'ok') return false;
  if (outcome.kind === 'timeout') return true;
  const code = (outcome.error as { code?: unknown } | null)?.code;
  return typeof code !== 'string' || NO_ANSWER_CODES.has(code);
}
