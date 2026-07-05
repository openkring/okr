/**
 * Hidden Matrix service/bot accounts (S1): never shown as members, never counted
 * for read receipts or DM labelling, never rung for calls.
 */
export const SERVICE_ACCOUNT_LOCALPARTS = new Set(['bk2-bot', 'bruno']);

/** True if the Matrix user ID belongs to a hidden service/bot account (S1). */
export function isServiceAccount(userId: string | undefined): boolean {
  if (!userId) return false;
  return SERVICE_ACCOUNT_LOCALPARTS.has(userId.split(':')[0].replace(/^@/, ''));
}
