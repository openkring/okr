import { collapseWhitespace, normalizeIban, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * VZ Depotbank AG account export (spec §4.11): `,`-separated, unquoted, no metadata block, newest first.
 * Header `Buchungsdatum,Valutadatum,Auftragsnummer,Konto,Kontoalias,IBAN,Buchungstext,Gutschrift,Belastung,Saldo`.
 * Every row carries the IBAN → `iban` from the first row (an export without it falls back to `''`, and the
 * store asks for the account). Amounts are prefixed with the currency and use `'` thousands separators;
 * `Belastung` is written with a doubled minus (`CHF --10'000.00`) — the sign comes from the column, not
 * from the text. `Saldo` is the running balance, `Auftragsnummer` the bank reference, `Valutadatum` is
 * ignored (D-BI-11). Umlauts arrive double-encoded (`GebÃ¼hr`) and are repaired before parsing.
 */
const HEADER = ['Buchungsdatum', 'Valutadatum', 'Auftragsnummer', 'Konto'];
const BANK_NAME = 'VZ Depotbank AG';
const SEPARATOR = ',';

const fields = (line: string) => parseCsvLine(stripBom(line), SEPARATOR);

export function matchesVzHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = fields(first);
  return HEADER.every((h, i) => f[i] === h) && f.includes('IBAN') && f.includes('Buchungstext');
}

/** UTF-8 bytes that were decoded as Latin-1 (`Ã¼` for `ü`) → the intended text; clean text is returned unchanged. */
export function repairVzEncoding(text: string): string {
  if (!/\u00c3[\u0080-\u00bf]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, ch => ch.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

/** `CHF --10'000.00` → `{ currency: 'CHF', amount: 1000000 }` (magnitude, minor units); undefined when empty or unreadable. */
export function parseVzAmount(value: string): { currency: string; amount: number } | undefined {
  const v = collapseWhitespace(value ?? '');
  if (v.length === 0) return undefined;
  const m = /^(?:([A-Z]{3})\s+)?-*([\d'.,]+)$/.exec(v);
  if (!m) return undefined;
  const amount = parseAmountMinor(m[2]);
  if (amount === undefined) return undefined;
  return { currency: m[1] ?? 'CHF', amount: Math.abs(amount) };
}

/** The bank itself is the counterparty of its fee and interest postings. */
const BANK_OWN_POSTINGS = /^(?:Gebühr|Gebühren|Spesen|Zins|Zinsen|Zinsgutschrift|Zinsbelastung|Abschluss|Kontoführung)\b/;
const PAYEE_PATTERNS: RegExp[] = [
  /^Gutschrift (.+)$/,
  /^(?:Zahlungsauftrag|Vergütung|Belastung|Zahlung|Dauerauftrag|Lastschrift|Überweisung) (.+)$/,
];

export function extractVzPayee(text: string): string {
  if (BANK_OWN_POSTINGS.test(text)) return 'VZ';
  for (const re of PAYEE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export function parseVz(text: string): ParsedStatement {
  const lines = splitLines(stripBom(repairVzEncoding(text)));
  const headerIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerIdx < 0) throw new BankImportError('empty-file');
  const header = fields(lines[headerIdx]);
  if (!HEADER.every((h, i) => header[i] === h)) throw new BankImportError('unknown-format', lines[headerIdx].slice(0, 80));
  const col = (name: string) => header.indexOf(name);
  const cDate = col('Buchungsdatum'), cRef = col('Auftragsnummer'), cIban = col('IBAN'), cText = col('Buchungstext');
  const cCredit = col('Gutschrift'), cDebit = col('Belastung'), cSaldo = col('Saldo');

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  let iban = '';
  let currency = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = fields(line);
    const lineNo = i + 1;
    const date = parseDdMmYyyy(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: f[cDate] ?? '' }); continue; }
    const credit = parseVzAmount(f[cCredit] ?? '');
    const debit = parseVzAmount(f[cDebit] ?? '');
    const money = credit ?? debit;
    if (!money) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }
    const amount = credit ? credit.amount : -money.amount;
    const rowIban = cIban >= 0 ? normalizeIban(f[cIban] ?? '') : '';
    if (!iban && rowIban) iban = rowIban;
    else if (rowIban && rowIban !== iban) warnings.push({ code: 'iban-mismatch', lineNo, detail: rowIban });
    if (!currency) currency = money.currency;
    const saldo = parseVzAmount(f[cSaldo] ?? '');
    const rawText = collapseWhitespace(f[cText] ?? '');
    rows.push({
      date, rawText, payee: extractVzPayee(rawText), amount, currency: money.currency,
      bankReference: (f[cRef] ?? '').trim(),
      ...(saldo !== undefined ? { saldo: saldo.amount } : {}),
      lineNo,
    });
  }
  const newestFirst = rows.length > 1 ? rows[0].date >= rows[rows.length - 1].date : true;
  return { format: 'vz', iban, currency: currency || 'CHF', bankName: BANK_NAME, dateFrom: '', dateTo: '', rows, warnings, newestFirst };
}
