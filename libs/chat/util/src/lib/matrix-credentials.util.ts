/**
 * What to do with the Matrix credentials stored on this device.
 * - `reuse`: the expected user's token is still usable.
 * - `renew`: same user (or nothing stored) — fetch a fresh token, keep the sync cache.
 * - `reset`: a DIFFERENT Matrix user is stored. Fetch new credentials AND drop the cached sync
 *   (IndexedDB `okr-matrix`): it holds the other person's rooms, timelines and `since` token. Tenant
 *   apps live on separate origins, but the iOS portal serves every tenant from one, and two tenants
 *   may be signed in as two persons (spec 1.179).
 */
export type StoredCredentialsAction = 'reuse' | 'renew' | 'reset';

export function storedCredentialsAction(
  storedUserId: string | undefined,
  expectedUserId: string,
  tokenUsable: boolean,
): StoredCredentialsAction {
  if (storedUserId === undefined) return 'renew';
  if (storedUserId !== expectedUserId) return 'reset';
  return tokenUsable ? 'reuse' : 'renew';
}
