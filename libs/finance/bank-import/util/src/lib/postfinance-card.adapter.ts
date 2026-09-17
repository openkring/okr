import { collapseWhitespace, parseAmountMinor, parseCsvLine, parseDdMmYyyy, parseIsoDate, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * PostFinance **card** statement (Visa / Mastercard) — a different export from the PostFinance
 * *account* CSV in `postfinance.adapter.ts`: `Kartenkonto:` meta instead of `Konto:`, ISO dates,
 * two unsigned amount columns, no IBAN, no saldo column, newest first.
 *
 * Like Bonuscard (spec 1.60 §4.13) the ledger account behind a card is a LIABILITY, so the sign is
 * inverted against the file: a `Lastschrift` (purchase) becomes NEGATIVE — a card credit, debt up —
 * and a `Gutschrift` (merchant refund) POSITIVE. No special case reaches the booking builder.
 *
 * Three row kinds are DROPPED, each as a warning, never silently:
 * - `Saldovortrag` — the opening balance, not a transaction; importing it would double the debt.
 * - `Total` — the trailing sum line, whose date is the export date and lies outside the period.
 * - the card payment (`2002 CH-DD ZAHLUNG`) — the direct debit from the bank account, which the
 *   bank's own statement already books as card debit / bank credit (the Bonuscard `Ihre Zahlung`
 *   rule, D-BI-18). Only a CREDIT row is dropped, so a debit that happens to be named that way
 *   is still imported rather than lost.
 *
 * The `Bearbeitungszuschlag` is NOT split off into `fee`. That field means "the processor kept it,
 * the bank leg is the net" (spec 1.62 §5) — here the surcharge is ADDED and the card really is
 * charged the gross, so the whole amount belongs on the counter account, exactly as a treasurer
 * books a card statement by hand. `6006 ZUSCHLAG CHF IM AUSLAND` rows are separate charges and
 * arrive as their own rows anyway.
 */
const BANK_NAME = 'PostFinance Card';
const IBAN_PREFIX = 'PFCARD-';
const HEADER_PREFIX = 'Datum;Bezeichnung';
const META_PREFIX = 'Kartenkonto:';

/** Fixed-width `Bezeichnung`: 25 chars merchant, 13 chars city, 3 chars country, then the FX detail. */
const NAME_WIDTH = 25;
const CITY_WIDTH = 13;

const SALDO_CARRY = 'saldovortrag';
const TOTAL = 'total';
/** `2002 CH-DD ZAHLUNG`, `IHRE ZAHLUNG - BESTEN DANK` — the leading 4-digit PostFinance code is optional. */
const PAYMENT = /^(?:\d{4} )?(?:CH-DD )?(?:IHRE )?ZAHLUNG\b/i;

export function matchesPostfinanceCardHeader(lines: string[]): boolean {
  const clean = lines.map(l => stripBom(l).trim());
  return clean.some(l => l.startsWith(META_PREFIX)) && clean.some(l => l.startsWith(HEADER_PREFIX));
}

/** `XXXX XXXX XXXX 3043 PostFinance Visa Business Card` → `PFCARD-XXXX3043` (15 chars, the validation floor). */
export function postfinanceCardIban(card: string): string {
  const last4 = /\b(\d{4})\b/.exec(card ?? '')?.[1];
  return last4 ? `${IBAN_PREFIX}XXXX${last4}` : '';
}

/** `28.12.2022 - 29.01.2023` → both ends as yyyymmdd; `['', '']` when the line is missing or odd. */
export function parseBillingPeriod(value: string): [string, string] {
  const m = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(value ?? '');
  return m ? [parseDdMmYyyy(m[1]) ?? '', parseDdMmYyyy(m[2]) ?? ''] : ['', ''];
}

/** `USD 29.00 Kurs 0.9372 vom 20.01.2023 …` → amountFx/fxRate. The CHF amount stays the bank's. */
export function extractCardFx(text: string): { amountFx?: { amount: number; currency: string }; fxRate?: number } {
  const m = /\b([A-Z]{3}) (\d[\d']*[.,]\d\d) Kurs (\d+\.\d+)/.exec(text);
  if (!m) return {};
  const amount = parseAmountMinor(m[2]);
  if (amount === undefined) return {};
  return { amountFx: { amount, currency: m[1] }, fxRate: Number(m[3]) };
}

/**
 * The merchant is the first fixed-width column — read from the RAW text, before whitespace is
 * collapsed, because the padding is what delimits it. A row without the card shape (a bank fee
 * such as `6006 ZUSCHLAG CHF IM AUSLAND`) has no merchant and yields ''.
 */
export function extractPostfinanceCardPayee(raw: string): string {
  const text = (raw ?? '').replace(/\s+$/, '');
  if (text.length <= NAME_WIDTH) return '';
  const hasCountry = /^[A-Z]{3}(?:\s|$)/.test(text.slice(NAME_WIDTH + CITY_WIDTH));
  const isPadded = /\s{2}/.test(text.slice(0, NAME_WIDTH + 1));
  return hasCountry || isPadded ? collapseWhitespace(text.slice(0, NAME_WIDTH)) : '';
}

function metaValue(fields: string[]): string {
  return (fields[1] ?? '').replace(/^=/, '').replace(/^"|"$/g, '').trim();
}

export function parsePostfinanceCard(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => stripBom(l).trim().startsWith(HEADER_PREFIX));
  if (headerIdx < 0) throw new BankImportError('unknown-format', lines[0] ?? '');

  let iban = '';
  let dateFrom = '';
  let dateTo = '';
  for (const line of lines.slice(0, headerIdx)) {
    const f = parseCsvLine(stripBom(line));
    switch (f[0]) {
      case 'Karte:': iban = postfinanceCardIban(metaValue(f)); break;
      case 'Kartenkonto:': if (!iban) iban = postfinanceCardIban(metaValue(f)); break;
      case 'Rechnungsperiode:': [dateFrom, dateTo] = parseBillingPeriod(metaValue(f)); break;
    }
  }
  if (!iban) throw new BankImportError('no-iban');

  const header = parseCsvLine(stripBom(lines[headerIdx]));
  const col = (name: string) => header.findIndex(h => h.startsWith(name));
  const cDate = col('Datum'), cText = col('Bezeichnung'), cCredit = col('Gutschrift'), cDebit = col('Lastschrift');
  if ([cDate, cText, cCredit, cDebit].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);
  const currency = /in ([A-Z]{3})/.exec(header[cCredit] ?? '')?.[1] ?? 'CHF';

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    if (line.startsWith('Disclaimer:')) break;
    const f = parseCsvLine(line);
    const lineNo = i + 1;

    const raw = f[cText] ?? '';
    const rawText = collapseWhitespace(raw);
    const marker = rawText.toLowerCase();
    if (marker.startsWith(SALDO_CARRY) || marker === TOTAL) { warnings.push({ code: 'line-skipped', lineNo, detail: rawText }); continue; }

    const date = parseIsoDate(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: f[cDate] ?? '' }); continue; }

    const credit = parseAmountMinor(f[cCredit] ?? '');
    const debit = parseAmountMinor(f[cDebit] ?? '');
    if (credit === undefined && debit === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }
    if (credit !== undefined && PAYMENT.test(rawText)) { warnings.push({ code: 'line-skipped', lineNo, detail: rawText }); continue; }

    // A purchase is written unsigned in `Lastschrift` and must become a Lastschrift on the liability account.
    const amount = credit !== undefined ? Math.abs(credit) : -Math.abs(debit as number);
    const fx = extractCardFx(rawText);
    rows.push({
      date, rawText, payee: extractPostfinanceCardPayee(raw), amount, currency,
      ...(fx.amountFx ? { amountFx: { amount: Math.sign(amount) * Math.abs(fx.amountFx.amount), currency: fx.amountFx.currency }, fxRate: fx.fxRate } : {}),
      bankReference: '', lineNo,
    });
  }

  return { format: 'postfinance-card', iban, currency, bankName: BANK_NAME, dateFrom, dateTo, rows, warnings, newestFirst: true };
}
