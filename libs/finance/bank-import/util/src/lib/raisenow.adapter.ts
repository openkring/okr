import { collapseWhitespace, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * RaiseNow Hub transaction export (spec 1.62 §4): `,`-separated, UTF-8 with BOM, 51 columns, newest first.
 *
 * RaiseNow is a payment processor, not a bank: the file is the transaction journal of a clearing
 * position, not an account statement. `amount` is therefore the GROSS amount (column `Betrag`) and the
 * processor fee rides along in `fee`; the net (`Nettobetrag`) is what lands on the clearing account and
 * is never stored — it is `amount - fee` (D-RN-3). The weekly lump-sum payout is NOT in this file; it
 * arrives through the bank statement of the receiving account (D-RN-2).
 *
 * Columns are resolved by header NAME, never by index — RaiseNow adds columns between releases.
 * Only `Status = succeeded` rows are transactions (D-RN-9); `Identifikationsnummer` is the bank
 * reference (D-RN-8) and `Konto-Identifikationsnummer` yields the pseudo-IBAN (D-RN-7).
 */
const BANK_NAME = 'RaiseNow';
const SEPARATOR = ',';
const IBAN_PREFIX = 'RAISENOW-';
const IBAN_ID_LENGTH = 18;   // prefix + 18 = 27 chars, inside the 15..34 of bankProfileValidations

/** The columns that must be present for the file to be a RaiseNow export. */
const HEADER = ['Identifikationsnummer', 'Erstellt', 'UTC-Offset', 'Status', 'Betrag'];

const fields = (line: string) => parseCsvLine(stripBom(line), SEPARATOR);

export function matchesRaisenowHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = fields(first);
  return HEADER.every((h, i) => f[i] === h);
}

/** `RAISENOW-0a49a1d9-7254-443e` from the constant account id; '' when the column is missing or empty. */
export function raisenowIban(accountId: string): string {
  const id = (accountId ?? '').trim();
  return id.length === 0 ? '' : IBAN_PREFIX + id.slice(0, IBAN_ID_LENGTH);
}

/** `13/09/2026 10:32:06` → `20260913`. The UTC offset column is ignored: the stamp is local wall clock. */
function parseCreated(value: string): string | undefined {
  return parseDdMmYyyy((value ?? '').trim().split(/\s+/)[0] ?? '');
}

export function parseRaisenow(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerIdx < 0) throw new BankImportError('empty-file');
  const header = fields(lines[headerIdx]);
  const col = (name: string) => header.indexOf(name);
  const cId = col('Identifikationsnummer'), cCreated = col('Erstellt'), cStatus = col('Status'),
    cAmount = col('Betrag'), cCurrency = col('Währung'), cFee = col('Gebühr'), cFeeCurrency = col('Währung der Gebühr'),
    cNet = col('Nettobetrag'), cFxAmount = col('Umgerechneter Betrag'), cFxCurrency = col('Umgerechnete Währung'),
    cTouchpoint = col('Touchpoint-Name'), cSolutionType = col('Art der Touchpoint-Lösung'), cMethod = col('Zahlungsmethode'),
    cPurpose = col('Spendenzweck'), cCampaign = col('Kampagnen-ID'),
    cFirstName = col('Vorname'), cLastName = col('Nachname'), cAccountId = col('Konto-Identifikationsnummer');
  if ([cId, cCreated, cStatus, cAmount, cCurrency].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);

  const at = (f: string[], c: number) => (c >= 0 ? (f[c] ?? '').trim() : '');
  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  let currency = '';
  let iban = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = fields(line);
    const lineNo = i + 1;

    const status = at(f, cStatus).toLowerCase();
    if (status !== 'succeeded') { warnings.push({ code: 'line-skipped', lineNo, detail: status || 'status' }); continue; }

    const date = parseCreated(at(f, cCreated));
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: at(f, cCreated) }); continue; }

    const amount = parseAmountMinor(at(f, cAmount));
    if (amount === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }

    const rowCurrency = at(f, cCurrency) || 'CHF';
    if (!currency) currency = rowCurrency;

    // Fee: only when it is stated in the transaction currency, so `amount - fee` stays one currency.
    let fee = Math.abs(parseAmountMinor(at(f, cFee)) ?? 0);
    const feeCurrency = at(f, cFeeCurrency);
    if (fee > 0 && feeCurrency && feeCurrency !== rowCurrency) {
      warnings.push({ code: 'currency-mismatch', lineNo, detail: `${feeCurrency} ≠ ${rowCurrency}` });
      fee = 0;
    }

    // `Nettobetrag = Betrag − Gebühr` holds in every RaiseNow row; a mismatch means the file changed
    // shape. The row is still imported — the gross amount is what the booking is built from.
    const net = parseAmountMinor(at(f, cNet));
    if (net !== undefined && Math.abs(net) !== Math.abs(amount) - fee) {
      warnings.push({ code: 'saldo-mismatch', lineNo, detail: `${net} ≠ ${Math.abs(amount)} - ${fee}` });
    }

    const fxAmount = parseAmountMinor(at(f, cFxAmount));
    const fxCurrency = at(f, cFxCurrency);
    const amountFx = fxAmount !== undefined && fxCurrency ? { amount: fxAmount, currency: fxCurrency } : undefined;

    const rawText = collapseWhitespace([
      BANK_NAME, at(f, cTouchpoint), at(f, cSolutionType), at(f, cMethod), at(f, cPurpose), at(f, cCampaign),
    ].filter(part => part.length > 0).join(' '));
    const payee = collapseWhitespace(`${at(f, cFirstName)} ${at(f, cLastName)}`);
    if (!iban) iban = raisenowIban(at(f, cAccountId));

    rows.push({ date, rawText, payee, amount, fee, currency: rowCurrency, amountFx, bankReference: at(f, cId), lineNo });
  }

  const dates = rows.map(r => r.date).sort();
  return {
    format: 'raisenow', iban, currency: currency || 'CHF', bankName: BANK_NAME,
    dateFrom: dates[0] ?? '', dateTo: dates[dates.length - 1] ?? '',
    rows, warnings, newestFirst: true,
  };
}
