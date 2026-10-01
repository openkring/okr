// apps/functions/src/person/account-mirror.decide.ts
//
// Pure decision half of the account mirror
// (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 9).
//
// Kept separate from the trigger for the same reason as account-sync.decide.ts: the branches that
// matter — a re-linked account, and a person who holds accounts in several tenants — are testable
// without standing up Firestore.

/** The part of `users/{uid}` this mirror cares about. */
export type UserAccountDoc = { personKey?: string; tenants?: string[]; roles?: { kiosk?: boolean } };

/** The part of `persons/{id}` this mirror writes. */
export type PersonMirrorDoc = { accountTenants?: string[]; isSystem?: boolean };

/**
 * Whether one of the person's accounts is a technical one. Today that is the kiosk account (the
 * shared tablet, `roles.kiosk`) — its person ('Logbuch') is no human and must not be picked.
 */
export function hasSystemAccount(users: UserAccountDoc[]): boolean {
  return users.some(user => user.roles?.kiosk === true);
}

/**
 * The merge patch for one person, or undefined when nothing changes.
 *
 * `isSystem` is only ever SET here, never cleared: it is a general marker for technical persons,
 * and one set by hand on a person without any kiosk account must survive every recompute.
 */
export function personMirrorPatch(users: UserAccountDoc[], current: PersonMirrorDoc): PersonMirrorDoc | undefined {
  const patch: PersonMirrorDoc = {};
  const desired = accountTenantsOf(users);
  if (!sameTenants(current.accountTenants, desired)) patch.accountTenants = desired;
  if (hasSystemAccount(users) && current.isSystem !== true) patch.isSystem = true;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * Which person documents must be recomputed after a write to `users/{uid}`.
 *
 * Both sides are returned when the account was re-linked to a different person: the old person may
 * lose a tenant, the new one gains it. An unchanged `personKey` still needs the recompute when the
 * tenants moved — a `users` document is otherwise touched on every role or profile edit, and those
 * must not cause a write.
 */
export function affectedPersonKeys(before: UserAccountDoc | undefined, after: UserAccountDoc | undefined): string[] {
  const oldKey = before?.personKey ?? '';
  const newKey = after?.personKey ?? '';
  if (oldKey === newKey) {
    const unchanged = sameTenants(before?.tenants, after?.tenants)
      && (before?.roles?.kiosk === true) === (after?.roles?.kiosk === true);
    return unchanged ? [] : [oldKey].filter(key => key.length > 0);
  }
  return [oldKey, newKey].filter(key => key.length > 0);
}

/**
 * The tenants a person holds an account in, derived from every `users` document pointing at them.
 *
 * A user document belongs to exactly one tenant (UserModel.tenants), but a person may hold several
 * accounts — `persons/kaiser` has seven, one per tenant, each with its own login address. So this
 * is a union over documents, never a single document's value, and the empty result (no account
 * anywhere) is a legitimate answer rather than a reason to skip the write.
 *
 * Sorted and de-duplicated so an unchanged set compares equal and produces no write.
 */
export function accountTenantsOf(users: UserAccountDoc[]): string[] {
  return [...new Set(users.flatMap(user => user.tenants ?? []))].filter(tenant => tenant.length > 0).sort();
}

/** Whether two tenant lists hold the same entries, order and duplicates aside. */
export function sameTenants(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = [...new Set(a ?? [])].sort();
  const right = [...new Set(b ?? [])].sort();
  return left.length === right.length && left.every((tenant, index) => tenant === right[index]);
}
