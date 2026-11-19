// apps/functions/src/email/notice-sender.logic.ts
//
// The sender a Mitteilung shows: the From address the Versand left under (the address chosen in the
// dialog, else the tenant's sender), not the person who pressed Send. Pure; onMailing calls it.

/**
 * The bare address of a From header: `"Seeclub" <app@seeclub.org>` → `app@seeclub.org`,
 * `kommunikation@seeclub.org` → itself. Empty in, empty out.
 */
export function noticeSenderOf(from: string | undefined): string {
  const value = (from ?? '').trim();
  const match = /<([^<>]+)>\s*$/.exec(value);
  return (match ? match[1] : value).trim();
}
