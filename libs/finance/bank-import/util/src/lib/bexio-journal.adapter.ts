import { collapseWhitespace, parseAmountMinor, parseCsvRecords, parseDdMmYyyy } from './csv.util';
import { BankImportError, ParsedWarning } from './types';
import { repairVzEncoding } from './vz.adapter';

/**
 * bexio journal export ("Buchungsjournal", spec §4.12). Not a bank statement: every row is a complete
 * double-entry posting with a debit (Soll) and a credit (Haben) account, so the result is a
 * `ParsedJournal`, not a `ParsedStatement`, and the format is not part of `BankFormat` / `detectFormat`.
 *
 * `,`-separated; the header and many cells are quoted and padded with newlines and spaces
 * (`"\n          Manuelle Buchung 354 ()\n        "`), hence `parseCsvRecords`. Accounts are written
 * `<no> - <name>`. Rows are newest first (descending bexio Id). The export arrives UTF-8-as-Latin-1
 * like the VZ export; the same repair applies.
 */
export type BexioJournalEntryKind = 'opening' | 'closing' | 'manual' | 'other';

export interface ParsedJournalRow {
  id: string;                 // bexio Id
  date: string;               // yyyymmdd
  reference: string;          // Referenz, whitespace-collapsed ("Manuelle Buchung 354 ()")
  kind: BexioJournalEntryKind;
  debitAccountNo: string;     // Soll
  debitAccountName: string;
  creditAccountNo: string;    // Haben
  creditAccountName: string;
  description: string;        // Beschreibung
  amount: number;             // minor units in `currency` (Betrag)
  currency: string;           // Buchungswährung
  fxRate: number;             // Umrechnungsfaktor (1 in the base currency)
  amountBase: number;         // minor units in `baseCurrency` (Betrag in Basiswährung)
  baseCurrency: string;       // Währung in Basiswährung
  vat: string;                // MWST, '' when empty
  lineNo: number;
}

export interface JournalAccount {
  no: string;
  name: string;
}

export interface ParsedJournal {
  format: 'bexio-journal';
  baseCurrency: string;
  dateFrom: string;           // yyyymmdd or ''
  dateTo: string;
  rows: ParsedJournalRow[];   // file order
  accounts: JournalAccount[]; // every account named in the file, once, sorted by number
  warnings: ParsedWarning[];
  newestFirst: boolean;
}

const HEADER = ['Id', 'Datum', 'Referenz', 'Soll', 'Haben', 'Beschreibung', 'Betrag'];
const SEPARATOR = ',';

function headerFields(text: string): string[] | undefined {
  const first = parseCsvRecords(repairVzEncoding(text ?? ''), SEPARATOR)[0];
  return first?.fields.map(collapseWhitespace);
}

export function matchesBexioJournalHeader(text: string): boolean {
  const f = headerFields(text);
  return !!f && HEADER.every((h, i) => f[i] === h);
}

/** `9100 - Eröffnungsbilanz` → `{ no: '9100', name: 'Eröffnungsbilanz' }`; the name may itself contain ` - `. */
export function splitBexioAccount(value: string): JournalAccount {
  const v = collapseWhitespace(value);
  const m = /^(\d+)(?:\s+-\s+(.*))?$/.exec(v);
  if (m) return { no: m[1], name: (m[2] ?? '').trim() };
  return { no: '', name: v };
}

function entryKind(reference: string): BexioJournalEntryKind {
  if (/^Eröffnungsbuchung\b/.test(reference)) return 'opening';
  if (/^Saldoübernahme\b/.test(reference)) return 'closing';
  if (/^Manuelle Buchung\b/.test(reference)) return 'manual';
  return 'other';
}

export function parseBexioJournal(text: string): ParsedJournal {
  const records = parseCsvRecords(repairVzEncoding(text ?? ''), SEPARATOR);
  if (records.length === 0) throw new BankImportError('empty-file');
  const header = records[0].fields.map(collapseWhitespace);
  const col = (name: string) => header.indexOf(name);
  const cId = col('Id'), cDate = col('Datum'), cRef = col('Referenz'), cDebit = col('Soll'), cCredit = col('Haben'),
    cText = col('Beschreibung'), cAmount = col('Betrag'), cCur = col('Buchungswährung'), cFx = col('Umrechnungsfaktor'),
    cBase = col('Betrag in Basiswährung'), cBaseCur = col('Währung in Basiswährung'), cVat = col('MWST');
  if ([cId, cDate, cRef, cDebit, cCredit, cText, cAmount].some(c => c < 0)) throw new BankImportError('unknown-format', header.join(SEPARATOR).slice(0, 80));

  const warnings: ParsedWarning[] = [];
  const rows: ParsedJournalRow[] = [];
  const accounts = new Map<string, JournalAccount>();
  let baseCurrency = '';
  const cell = (f: string[], c: number): string => (c >= 0 ? collapseWhitespace(f[c] ?? '') : '');

  for (const { fields: f, lineNo } of records.slice(1)) {
    const date = parseDdMmYyyy(cell(f, cDate));
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: cell(f, cDate) }); continue; }
    const amount = parseAmountMinor(cell(f, cAmount));
    if (amount === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }
    const currency = cell(f, cCur) || 'CHF';
    const rowBaseCurrency = cell(f, cBaseCur) || currency;
    if (!baseCurrency) baseCurrency = rowBaseCurrency;
    const fx = Number(cell(f, cFx));
    const fxRate = Number.isFinite(fx) && fx > 0 ? fx : 1;
    const amountBase = parseAmountMinor(cell(f, cBase)) ?? Math.round(amount * fxRate);
    const debit = splitBexioAccount(cell(f, cDebit));
    const credit = splitBexioAccount(cell(f, cCredit));
    for (const a of [debit, credit]) if (a.no && !accounts.has(a.no)) accounts.set(a.no, a);
    const reference = cell(f, cRef);
    rows.push({
      id: cell(f, cId), date, reference, kind: entryKind(reference),
      debitAccountNo: debit.no, debitAccountName: debit.name, creditAccountNo: credit.no, creditAccountName: credit.name,
      description: cell(f, cText), amount, currency, fxRate, amountBase, baseCurrency: rowBaseCurrency, vat: cell(f, cVat), lineNo,
    });
  }

  const dates = rows.map(r => r.date).sort();
  const newestFirst = rows.length > 1 ? rows[0].date >= rows[rows.length - 1].date : true;
  return {
    format: 'bexio-journal', baseCurrency: baseCurrency || 'CHF', dateFrom: dates[0] ?? '', dateTo: dates[dates.length - 1] ?? '',
    rows, accounts: [...accounts.values()].sort((a, b) => a.no.localeCompare(b.no)), warnings, newestFirst,
  };
}
