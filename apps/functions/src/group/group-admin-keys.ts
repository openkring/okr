/**
 * Pure helpers for `groups/{id}.adminKeys` — the flat, server-maintained mirror of `admins[].key`
 * that firestore.rules can test with `in` (rules cannot iterate over a list of maps).
 *
 * Keys keep their EXACT case: the rules compare against callerPersonKey(). Do not reuse
 * `adminKeysOf` from matrix-simple/chat-mode-sync.ts — it lowercases.
 */

/** The personKeys of a group's admins: exact case, duplicates and empty keys dropped, order kept. */
export function groupAdminKeys(admins: { key?: string }[] | undefined): string[] {
  const keys: string[] = [];
  for (const admin of admins ?? []) {
    const key = admin?.key;
    if (typeof key === 'string' && key !== '' && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** True when the stored `adminKeys` differs from `next` (order matters). False = no write, so no trigger loop. */
export function adminKeysNeedUpdate(before: string[] | undefined, next: string[]): boolean {
  const current = before ?? [];
  return current.length !== next.length || current.some((key, i) => key !== next[i]);
}
