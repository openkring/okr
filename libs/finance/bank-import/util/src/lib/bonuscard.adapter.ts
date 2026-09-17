import { collapseWhitespace, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * Bonuscard credit-card statement (spec 1.60 §4.13): `,`-separated, six columns, newest first,
 * `dd/mm/yyyy`, no IBAN, no reference, no saldo.
 *
 * Two conventions are inverted against every other format, and one rule fixes both:
 * **`amount = −Betrag`**. The file writes a purchase POSITIVE (`30.00`) and a credit NEGATIVE, and the
 * ledger account behind a card is a LIABILITY, not a class-1 asset. Negating makes a purchase a
 * Lastschrift (expense debit / card credit, debt up) and a `Rundung` a Gutschrift (card debit /
 * income credit, debt down) — exactly right, with no special case in the booking builder.
 *
 * `Ihre Zahlung` rows are DROPPED (D-BI-18): that is the transfer from the bank account, which the
 * bank's own statement already books as card debit / bank credit. Importing it from both sides would
 * double-book it. The card account still nets to zero over a cycle — the charges come from here, the
 * payment from the bank statement. The drop is reported as a warning, never silently.
 */
const BANK_NAME = 'Bonuscard';
const SEPARATOR = ',';
const IBAN_PREFIX = 'BONUSCARD-';
/** `Ihre Zahlung` — matched on the normalized prefix, so a suffixed variant is still recognised. */
const PAYMENT_PREFIX = 'ihre zahlung';

const fields = (line: string) => parseCsvLine(stripBom(line), SEPARATOR);

/** Only ASCII header names are compared: `Währung` is the one non-ASCII column and must not gate detection. */
export function matchesBonuscardHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = fields(first);
  return f[0] === 'Datum' && f[1] === 'Beschreibung' && f[2] === 'Karte' && f.includes('Betrag') && f.includes('Status');
}

/** `**7005` → `BONUSCARD-XXXX7005` (18 chars, inside the 15..34 of bankProfileValidations). */
export function bonuscardIban(card: string): string {
  const digits = (card ?? '').replace(/\D/g, '');
  return digits.length === 0 ? '' : `${IBAN_PREFIX}XXXX${digits.slice(-4).padStart(4, '0')}`;
}

/** True for the monthly transfer from the bank account — booked from the bank statement, not from here. */
export function isBonuscardPayment(description: string): boolean {
  return collapseWhitespace(description ?? '').toLowerCase().startsWith(PAYMENT_PREFIX);
}

export function parseBonuscard(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerIdx < 0) throw new BankImportError('empty-file');
  const header = fields(lines[headerIdx]);
  const col = (name: string) => header.indexOf(name);
  const cDate = col('Datum'), cText = col('Beschreibung'), cCard = col('Karte'),
    cCurrency = col('Währung'), cAmount = col('Betrag'), cStatus = col('Status');
  if ([cDate, cText, cCard, cAmount, cStatus].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);

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

    const status = at(f, cStatus);
    if (status !== 'Verarbeitete Transaktion') { warnings.push({ code: 'line-skipped', lineNo, detail: status || 'status' }); continue; }

    const description = collapseWhitespace(at(f, cText));
    if (isBonuscardPayment(description)) { warnings.push({ code: 'line-skipped', lineNo, detail: description }); continue; }

    const date = parseDdMmYyyy(at(f, cDate));
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: at(f, cDate) }); continue; }

    const betrag = parseAmountMinor(at(f, cAmount));
    if (betrag === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }

    const rowCurrency = at(f, cCurrency) || 'CHF';
    if (!currency) currency = rowCurrency;
    const card = at(f, cCard);
    if (!iban) iban = bonuscardIban(card);

    // A purchase is written positive and must become a Lastschrift on a liability account.
    rows.push({ date, rawText: description, payee: card ? description : '', amount: -betrag, currency: rowCurrency, bankReference: '', lineNo });
  }

  const dates = rows.map(r => r.date).sort();
  return {
    format: 'bonuscard', iban, currency: currency || 'CHF', bankName: BANK_NAME,
    dateFrom: dates[0] ?? '', dateTo: dates[dates.length - 1] ?? '',
    rows, warnings, newestFirst: true,
  };
}
