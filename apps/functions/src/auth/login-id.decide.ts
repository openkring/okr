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
