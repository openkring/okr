// apps/functions/src/auth/login-id.decide.ts

/** Which Auth identity openAccount uses for a person (spec 1.71 §5.3). Pure, see the spec file. */
export type LoginIdentity = 'createReal' | 'reuse' | 'exists' | 'synthetic';

/**
 * @param authUid          the uid Firebase Auth holds for the favourite email, if any
 * @param holderPersonKey  personKey of users/{authUid}; undefined when that doc does not exist
 * @param personKey        the person the account is being opened for
 */
export function decideLoginIdentity(authUid: string | undefined, holderPersonKey: string | undefined, personKey: string): LoginIdentity {
  if (!authUid) return 'createReal';
  // closeAccount deletes users/{uid} but keeps the Auth identity — a returning member must get
  // their old login back, so an identity without a users doc is reused exactly as before.
  if (holderPersonKey === undefined) return 'reuse';
  return holderPersonKey && holderPersonKey === personKey ? 'exists' : 'synthetic';
}
