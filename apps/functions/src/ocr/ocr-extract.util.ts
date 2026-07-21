export interface OcrRuleLite {
  okey: string;
  ocrUsage: string;
  party: string;
  aliases: string[];
  accountKey: string;
  rank: number;
  active: boolean;
}

const LEGAL_SUFFIXES = ['ag', 'gmbh', 'sa', 'sarl', 'gemeinschaft', 'genossenschaft', 'kg', 'ltd', 'inc'];

/** Lowercase, strip diacritics, drop punctuation, remove trailing legal-form words, collapse spaces. */
export function normalizeVendor(raw: string): string {
  const base = (raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = base.split(' ').filter(w => w.length > 0 && !LEGAL_SUFFIXES.includes(w));
  return words.join(' ');
}

/** Highest-rank active rule for `usage` whose party/alias is normalized-contained in the vendor. */
export function matchRule(rules: OcrRuleLite[], usage: string, vendor: string): OcrRuleLite | undefined {
  const normVendor = normalizeVendor(vendor);
  const candidates = rules.filter(r =>
    r.active && r.ocrUsage === usage &&
    [r.party, ...(r.aliases ?? [])].some(tok => tok.length > 0 && normVendor.includes(tok)),
  );
  return candidates.sort((a, b) => b.rank - a.rank)[0];
}

/** Rule account wins, else the LLM proposal, else the config default. */
export function resolveDebitAccount(ruleAccount: string, llmAccount: string, defaultAccount: string): string {
  return ruleAccount || llmAccount || defaultAccount;
}

/** Major currency units → integer cents. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** max(bookingNo) for the given year + 1; 1 when none. */
export function computeNextBookingNo(bookings: { date: string; bookingNo: number }[], year: number): number {
  const yearStr = String(year);
  const max = bookings
    .filter(b => (b.date ?? '').startsWith(yearStr))
    .reduce((m, b) => Math.max(m, b.bookingNo ?? 0), 0);
  return max + 1;
}

/** Σdebit === Σcredit across lines (cents). */
export function isBalanced(lines: { debit: number; credit: number }[]): boolean {
  const debit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return debit === credit;
}

/** Deterministic, Firestore-safe doc id from the object path + generation (idempotency key). */
export function ocrResultId(objectName: string, generation: string): string {
  return `${objectName}_${generation}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}
