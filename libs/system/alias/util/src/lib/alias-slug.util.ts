/**
 * Letters are folded to their ASCII form BEFORE the accent strip, because NFD decomposition
 * either decomposes differently than desired (ä → a instead of ae) or doesn't apply at all
 * (ø, æ, etc. have no combining-mark form). Folding runs first, so 'Sørensen' → 'soerensen',
 * not 's-rensen'. In a lookup space the slug is what a human recognises in the decisions file,
 * so the difference is not cosmetic.
 */
const FOLD: Readonly<Record<string, string>> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue',
  ß: 'ss', ẞ: 'ss',
  ø: 'oe', Ø: 'oe', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  ð: 'd', Ð: 'd', þ: 'th', Þ: 'th', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd',
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
  const folded = [...label].map((char) => FOLD[char] ?? char).join('');
  return folded
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // combining accents: e-acute becomes e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // everything isValidAliasFormat rejects, incl. '_' and '/'
    .replace(/^-|-$/g, '');
}
