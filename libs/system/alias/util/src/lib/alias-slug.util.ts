/**
 * German umlauts are folded to their two-letter form BEFORE the accent strip, because NFD
 * decomposition would turn 'ä' into 'a' — 'stfa' instead of 'staefa'. In a lookup space the
 * slug is what a human recognises in the decisions file, so the difference is not cosmetic.
 */
const UMLAUTS: Readonly<Record<string, string>> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss',
};

/**
 * An arbitrary human label → an alias segment `isValidAliasFormat` accepts.
 *
 * Returns '' when nothing survives; the caller must treat that as "no alias" and never build a
 * document id from it — `<tenant>__<space>__` would collide across every empty label.
 *
 * This is the SHARED contract between seeding and reading: `scripts/seed-diary-aliases.mjs`
 * writes `buildAliasDocId(tenant, space, toAliasSlug(label), false)` and the diary import
 * resolves with exactly the same expression. Change this function and both sides move together
 * or every lookup misses.
 */
export function toAliasSlug(label: string): string {
  const folded = [...label].map((char) => UMLAUTS[char] ?? char).join('');
  return folded
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // combining accents: e-acute becomes e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // everything isValidAliasFormat rejects, incl. '_' and '/'
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
