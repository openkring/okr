// apps/functions/src/auth/login-id.decide.ts
//
// The pure decisions of openAccount (spec 1.71 §5.3). No Firebase here — see the spec file.

/** Which Auth identity openAccount uses for a person. */
export type LoginIdentity = 'createReal' | 'reuse' | 'exists' | 'synthetic';

/** Custom claim openAccount stamps on every Auth identity it creates or reuses: whose login it is. */
export const PERSON_KEY_CLAIM = 'okrPersonKey';

/**
 * @param authUid          the uid Firebase Auth holds for the favourite email, if any
 * @param holderPersonKey  personKey of users/{authUid}; undefined when that doc does not exist
 * @param personKey        the person the account is being opened for
 * @param claimPersonKey   the identity's `okrPersonKey` custom claim; undefined/'' when it has none
 *
 * closeAccount deletes users/{uid} but keeps the Auth identity, so a returning member gets their
 * old login back: an orphaned identity is reused. But only for the person it was stamped for, or
 * when it carries no stamp at all (identities created before the claim existed keep today's
 * behaviour). One stamped for somebody else is never handed over — the child opened after the
 * parent left must not inherit the parent's real-email login; it gets a Benutzername account.
 */
export function decideLoginIdentity(
  authUid: string | undefined,
  holderPersonKey: string | undefined,
  personKey: string,
  claimPersonKey?: string,
): LoginIdentity {
  if (!authUid) return 'createReal';
  if (holderPersonKey === undefined) {
    return !claimPersonKey || claimPersonKey === personKey ? 'reuse' : 'synthetic';
  }
  return holderPersonKey && holderPersonKey === personKey ? 'exists' : 'synthetic';
}

/** What to do about an account this person may already hold in the tenant. */
export type OwnAccountAction = 'proceed' | 'exists' | 'resume';

/**
 * The guard that runs before openAccount creates or reuses anything: a person holds at most one
 * account per tenant, whatever the favourite email resolves to today.
 *
 * @param identity  the result of decideLoginIdentity
 * @param ownDoc    this person's users doc in the tenant, if any
 *
 * 'exists' is left alone (proceed): the email holder IS this person, decided already. An own doc
 * with an empty loginEmail is a synthetic open that died between writing the doc and finishing
 * the Auth side — it is resumed, never frozen as 'exists'.
 */
export function decideOwnAccount(identity: LoginIdentity, ownDoc: { loginEmail?: string } | undefined): OwnAccountAction {
  if (identity === 'exists' || !ownDoc) return 'proceed';
  return ownDoc.loginEmail?.trim() ? 'exists' : 'resume';
}

/** What the Auth identity behind a Benutzername's synthetic address means for handing that name out. */
export type SyntheticCandidate = 'free' | 'reclaim' | 'taken';

/** The Auth identity that already holds `<candidate>@login.<domain>`, if any. */
export interface SyntheticIdentity {
  readonly uid: string;
  /** its `okrPersonKey` custom claim; undefined/'' when it has none */
  readonly claimPersonKey?: string;
  /** users/{uid} exists — a live account, whatever tenant it serves */
  readonly hasUserDoc: boolean;
}

/**
 * Whether a Benutzername candidate can be handed to `personKey`. Firestore alone cannot answer it:
 * closeAccount deletes users/{uid} but keeps the Auth identity, so a Benutzername that is free in
 * Firestore may still be the address of an orphaned identity — and createUser with that address
 * would fail on every retry, for this person and for every later namesake.
 *
 * @param identity  the Auth identity holding the candidate's synthetic address; undefined when none
 * @param personKey the person the Benutzername is for
 * @param selfUid   the uid the Benutzername goes to, when it is already fixed (resume, setLoginId,
 *                  swap) — that uid holding the address itself is no collision
 *
 * - no identity, or the identity is `selfUid` → 'free';
 * - an orphan (no users doc) stamped for this very person → 'reclaim': the returning member gets
 *   their old login back, like decideLoginIdentity's 'reuse' for a real email;
 * - anything else — a live account, somebody else's orphan, an unstamped orphan (whose it is cannot
 *   be told, so it is never handed out) → 'taken'.
 * A caller whose uid is already fixed cannot move to another identity and treats 'reclaim' as 'taken'.
 */
export function decideSyntheticCandidate(identity: SyntheticIdentity | undefined, personKey: string, selfUid?: string): SyntheticCandidate {
  if (!identity) return 'free';
  if (selfUid && identity.uid === selfUid) return 'free';
  if (!identity.hasUserDoc && !!personKey && identity.claimPersonKey === personKey) return 'reclaim';
  return 'taken';
}

/**
 * The daily backfill stamps `okrPersonKey` on every live account that lacks it: identities created
 * before the claim existed would otherwise be orphaned unstamped one day and — through
 * decideLoginIdentity's legacy 'reuse' — handed to a different person sharing the email (spec §5.3
 * "never for a different person"). An existing stamp is never overwritten, and a users doc without
 * personKey has nothing to stamp.
 */
export function needsPersonKeyStamp(claims: Record<string, unknown> | undefined, personKey: string | undefined): boolean {
  return !!personKey && !claims?.[PERSON_KEY_CLAIM];
}

/**
 * The backfill's selection: the live users docs whose Auth identity still needs its stamp. A doc
 * without an Auth identity (a half-open account) has nothing to stamp and is left to openAccount.
 * @param users        every users doc: its uid and personKey
 * @param claimsByUid  every Auth identity's custom claims (undefined when it has none)
 */
export function personKeyStampsDue(
  users: readonly { uid: string; personKey: string }[],
  claimsByUid: ReadonlyMap<string, Record<string, unknown> | undefined>,
): { uid: string; personKey: string; claims: Record<string, unknown> }[] {
  return users
    .filter((u) => claimsByUid.has(u.uid) && needsPersonKeyStamp(claimsByUid.get(u.uid), u.personKey))
    .map((u) => ({ uid: u.uid, personKey: u.personKey, claims: claimsByUid.get(u.uid) ?? {} }));
}

/** State kept per (tenantId, loginId) in the `login-throttle` collection. */
export interface ThrottleState { failures: number; lockedUntil: number }
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60_000;

export function isLocked(s: ThrottleState | undefined, now: number): boolean {
  return (s?.lockedUntil ?? 0) > now;
}

export function afterFailure(s: ThrottleState | undefined, now: number): ThrottleState {
  // An active lock is not touched by a failure that lands during it (fix round 2 #1): without this,
  // a burst of >= MAX_FAILURES parallel wrong guesses that all read the same already-locked state
  // would each compute failures = 0 + 1 and overwrite the lock with { failures: 1, lockedUntil: 0 },
  // permanently unlocking the account. Once locked, the state stays exactly as read until it expires
  // naturally (isLocked(s, now) turns false), at which point the branch below resets the counter.
  if (s && isLocked(s, now)) return s;
  const expired = !!s && s.lockedUntil > 0 && s.lockedUntil <= now;
  const failures = (expired ? 0 : s?.failures ?? 0) + 1;
  return failures >= MAX_FAILURES ? { failures: 0, lockedUntil: now + LOCK_MS } : { failures, lockedUntil: 0 };
}

/** identitytoolkit error.message → our three answers. Disabled is NOT distinguished (spec §5.1). */
export function mapSignInError(message: string): 'invalid' | 'throttled' | 'error' {
  const code = (message ?? '').split(/[ :]/)[0];
  if (['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED'].includes(code)) return 'invalid';
  if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') return 'throttled';
  return 'error';
}
