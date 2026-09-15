import { AccountModel } from '@okr/shared-models';

import { ParsedJournal, ParsedJournalRow } from './bexio-journal.adapter';

export type JournalAccountMatch = 'matched' | 'missing' | 'group' | 'ambiguous';

/** One row of the mapping dialog: a bexio account number and the tenant account it lands on. */
export interface JournalAccountMapping {
  no: string;            // bexio account number as written in the file
  name: string;          // bexio account name
  accountKey: string;    // AccountModel okey; '' until resolved
  accountName: string;   // name of the matched account, for the side-by-side display
  match: JournalAccountMatch;
}

/** The mapping dialog's form model. */
export interface JournalAccountMap {
  entries: JournalAccountMapping[];
}

/** One entry of the `postJournalImport` payload (spec §12.3); amounts in minor units. */
export interface JournalEntryPayload {
  id: string;
  date: string;
  title: string;
  reference: string;
  debitAccountKey: string;
  creditAccountKey: string;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
}

export interface PostJournalImportPayload { accountingTenantId: string; entries: JournalEntryPayload[]; }
export interface PostJournalImportResult {
  posted: number;
  replayed: number;
  failed: { id: string; reason: string }[];
  sums: Record<string, number>;   // accountKey → debit − credit (base currency, minor units) of posted + replayed entries
}

/** `0100` and `100` are the same number: the bexio account sync pads to four digits, the CSV chart import does not. */
export function normalizeAccountNo(no: string): string {
  return (no ?? '').trim().replace(/^0+(?=\d)/, '');
}

/** Rows that become bookings (spec §12.1): opening/closing entries and zero amounts are bexio mechanics, not transactions. */
export function importableJournalRows(journal: ParsedJournal): ParsedJournalRow[] {
  return journal.rows.filter(r => (r.kind === 'manual' || r.kind === 'other') && r.amount !== 0);
}

/**
 * Match every bexio account used by the importable rows against the tenant's chart of accounts by
 * number (spec §12.2). Leaf = an account no other account names as parent. Names are never compared.
 */
export function resolveJournalAccounts(rows: ParsedJournalRow[], accounts: AccountModel[]): JournalAccountMapping[] {
  const parents = new Set(accounts.map(a => a.parentKey).filter(k => k.length > 0));
  const byNo = new Map<string, AccountModel[]>();
  for (const a of accounts) {
    if (a.isArchived || !a.id) continue;
    const no = normalizeAccountNo(a.id);
    byNo.set(no, [...(byNo.get(no) ?? []), a]);
  }
  const used = new Map<string, string>();
  for (const r of rows) {
    if (r.debitAccountNo && !used.has(r.debitAccountNo)) used.set(r.debitAccountNo, r.debitAccountName);
    if (r.creditAccountNo && !used.has(r.creditAccountNo)) used.set(r.creditAccountNo, r.creditAccountName);
  }
  return [...used.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([no, name]) => {
      const candidates = byNo.get(normalizeAccountNo(no)) ?? [];
      const leaves = candidates.filter(a => a.type !== 'group' && a.type !== 'root' && !parents.has(a.okey));
      if (leaves.length === 1) return { no, name, accountKey: leaves[0].okey, accountName: leaves[0].name, match: 'matched' as const };
      if (leaves.length > 1) return { no, name, accountKey: '', accountName: '', match: 'ambiguous' as const };
      if (candidates.length > 0) return { no, name, accountKey: '', accountName: '', match: 'group' as const };
      return { no, name, accountKey: '', accountName: '', match: 'missing' as const };
    });
}

/** Per bexio account number: debit − credit in base currency over the given rows (the file's own totals). */
export function journalAccountSums(rows: ParsedJournalRow[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const r of rows) {
    sums.set(r.debitAccountNo, (sums.get(r.debitAccountNo) ?? 0) + r.amountBase);
    sums.set(r.creditAccountNo, (sums.get(r.creditAccountNo) ?? 0) - r.amountBase);
  }
  return sums;
}

/** Apply the confirmed mapping; throws when a row names a number the mapping does not resolve. */
export function toJournalEntries(rows: ParsedJournalRow[], mapping: JournalAccountMapping[]): JournalEntryPayload[] {
  const keyOf = new Map(mapping.map(m => [m.no, m.accountKey]));
  const resolve = (no: string): string => {
    const key = keyOf.get(no);
    if (!key) throw new Error(`toJournalEntries: account ${no} is not mapped`);
    return key;
  };
  return rows.map(r => ({
    id: r.id, date: r.date, title: r.description || r.reference, reference: r.reference,
    debitAccountKey: resolve(r.debitAccountNo), creditAccountKey: resolve(r.creditAccountNo),
    amount: r.amount, currency: r.currency, amountBase: r.amountBase, baseCurrency: r.baseCurrency,
  }));
}

export interface JournalSumDiff { no: string; accountKey: string; file: number; ledger: number; }

/** Post-check (spec §12.4): the file's per-number sums against the callable's per-account sums. */
export function compareJournalSums(fileSums: Map<string, number>, mapping: JournalAccountMapping[], ledgerSums: Record<string, number>): JournalSumDiff[] {
  const out: JournalSumDiff[] = [];
  for (const m of mapping) {
    const file = fileSums.get(m.no) ?? 0;
    const ledger = ledgerSums[m.accountKey] ?? 0;
    if (file !== ledger) out.push({ no: m.no, accountKey: m.accountKey, file, ledger });
  }
  return out;
}
