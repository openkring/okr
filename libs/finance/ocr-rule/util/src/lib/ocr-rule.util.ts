// KEEP IN SYNC with normalizeVendor() in apps/functions/src/ocr/ocr-extract.util.ts.
// apps/functions and libs are separate TS build roots and cannot share code, so this is
// an intentional duplicate. The matcher only normalizes the extracted vendor, never the
// stored party/aliases — so rules must be saved pre-normalized or they silently never match.
const LEGAL_SUFFIXES = ['ag', 'gmbh', 'sa', 'sarl', 'gemeinschaft', 'genossenschaft', 'kg', 'ltd', 'inc'];

/** Lowercase, strip diacritics, drop punctuation, remove legal-form words, collapse spaces. */
export function normalizeParty(raw: string): string {
  const base = (raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.split(' ').filter(w => w.length > 0 && !LEGAL_SUFFIXES.includes(w)).join(' ');
}
