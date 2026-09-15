import { collapseWhitespace, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * Yuh activity export (spec §4.9): `;`-separated, text fields triple-quoted (`"""Netflix"""`), dates
 * `dd/mm/yyyy`, oldest first. DEBIT is already signed (negative), CREDIT positive; each row carries at
 * most one of them. Rows without a money amount (`REWARD_RECEIVED`, an ASSET/QUANTITY only) are not
 * bookings and are skipped silently. The file names no account → `iban = ''`.
 */
const HEADER = ['DATE', 'ACTIVITY TYPE', 'ACTIVITY NAME', 'DEBIT', 'DEBIT CURRENCY', 'CREDIT', 'CREDIT CURRENCY'];
const BANK_NAME = 'Yuh';

export function matchesYuhHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = parseCsvLine(stripBom(first));
  return HEADER.every((h, i) => f[i] === h);
}

/** `"Netflix"` (the inner pair of a triple-quoted field survives parseCsvLine) → `Netflix`. */
function unquote(value: string): string {
  const v = (value ?? '').trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).trim() : v;
}

export function parseYuh(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerIdx < 0) throw new BankImportError('empty-file');
  const header = parseCsvLine(lines[headerIdx]);
  const col = (name: string) => header.indexOf(name);
  const cDate = col('DATE'), cType = col('ACTIVITY TYPE'), cName = col('ACTIVITY NAME'), cDebit = col('DEBIT'), cDebitCcy = col('DEBIT CURRENCY'),
    cCredit = col('CREDIT'), cCreditCcy = col('CREDIT CURRENCY'), cLocality = col('LOCALITY'), cRecipient = col('RECIPIENT'), cSender = col('SENDER'), cAsset = col('ASSET');
  if ([cDate, cType, cName, cDebit, cDebitCcy, cCredit, cCreditCcy, cRecipient, cSender].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  let currency = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = parseCsvLine(line);
    const lineNo = i + 1;
    const debit = parseAmountMinor(f[cDebit] ?? '');
    const credit = parseAmountMinor(f[cCredit] ?? '');
    if (debit === undefined && credit === undefined) {
      // reward / asset activity without a money movement — not a booking
      if ((f[cAsset] ?? '').trim().length === 0) warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' });
      continue;
    }
    const date = parseDdMmYyyy(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: f[cDate] ?? '' }); continue; }
    const amount = (credit ?? 0) + (debit ?? 0);
    const rowCurrency = (debit !== undefined ? f[cDebitCcy] : f[cCreditCcy]) || 'CHF';
    if (!currency) currency = rowCurrency;
    const name = unquote(f[cName] ?? '');
    const locality = cLocality >= 0 ? unquote(f[cLocality] ?? '') : '';
    const rawText = collapseWhitespace(`${name} ${locality}`);
    const payee = unquote(amount < 0 ? f[cRecipient] ?? '' : f[cSender] ?? '') || unquote(f[cRecipient] ?? '') || unquote(f[cSender] ?? '');
    rows.push({ date, rawText, payee, amount, currency: rowCurrency, bankReference: '', lineNo });
  }
  const newestFirst = rows.length > 1 ? rows[0].date > rows[rows.length - 1].date : false;
  return { format: 'yuh', iban: '', currency: currency || 'CHF', bankName: BANK_NAME, dateFrom: '', dateTo: '', rows, warnings, newestFirst };
}
