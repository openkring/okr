// apps/functions/src/person/account-mirror.decide.ts
//
// Pure decision half of the account mirror
// (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 9).
//
// Kept separate from the trigger for the same reason as account-sync.decide.ts: the only
// non-obvious branch — a user account re-linked to a different person — is testable without
// standing up Firestore.

/** The part of `users/{uid}` this mirror cares about. */
export type UserAccountDoc = { personKey?: string };

/** One person document to patch, and the value to write. */
export type HasAccountPatch = { personKey: string; hasAccount: boolean };

/**
 * Which person documents must be brought in line after a write to `users/{uid}`.
 *
 * Three cases, all expressed by comparing the old and the new `personKey`:
 *  - created  (no old key)          → the new person gains the flag;
 *  - deleted  (no new key)          → the old person loses it;
 *  - re-linked (both, different)    → both are patched, in that order.
 *
 * An unchanged key produces no write at all — a `users` document is touched on every role or
 * profile edit, and re-writing the person on each of those would be pure noise.
 */
export function nextHasAccount(
  before: UserAccountDoc | undefined,
  after: UserAccountDoc | undefined,
): HasAccountPatch[] {
  const oldKey = before?.personKey ?? '';
  const newKey = after?.personKey ?? '';
  if (oldKey === newKey) return [];

  const patches: HasAccountPatch[] = [];
  if (oldKey) patches.push({ personKey: oldKey, hasAccount: false });
  if (newKey) patches.push({ personKey: newKey, hasAccount: true });
  return patches;
}
