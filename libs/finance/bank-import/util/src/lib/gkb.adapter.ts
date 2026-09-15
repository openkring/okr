import { collapseWhitespace, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * Graubündner Kantonalbank export (spec §4.7): `;`-separated, unquoted. A metadata block
 * (`Kontoauszug bis:`, `Kontonummer:`, `Bezeichnung:`, `Saldo: CHF …`) and the account holder's
 * address precede the column header `Datum;Buchungstext;Betrag;Saldo;Valuta`. Dates are `dd.mm.yy`,
 * `Betrag` is already signed, `Saldo` is the running balance, rows are newest first. The file names
 * a bank account number but no IBAN → `iban = ''`. A `Saldovortrag` row is the carried-forward
 * balance, not a transaction, and is dropped silently.
 */
const HEADER = ['Datum', 'Buchungstext', 'Betrag', 'Saldo'];
const BANK_NAME = 'Graubündner Kantonalbank';
const HEADER_SCAN_LINES = 20;

function isHeader(line: string): boolean {
  const f = parseCsvLine(stripBom(line));
  return HEADER.every((h, i) => f[i] === h);
}

export function matchesGkbHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  return /^Kontoauszug bis:/.test(stripBom(first).trim()) && lines.slice(0, HEADER_SCAN_LINES).some(isHeader);
}

/** `dd.mm.yy` → yyyymmdd (two-digit years are 20yy); `dd.mm.yyyy` is accepted as well. */
export function parseGkbDate(value: string): string | undefined {
  const v = (value ?? '').trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(v);
  if (m) return parseDdMmYyyy(`${m[1]}.${m[2]}.20${m[3]}`);
  return parseDdMmYyyy(v);
}

/** The bank itself is the counterparty of interest and closing postings. */
const BANK_OWN_POSTINGS = /^(?:Zinsbelastung|Zinsgutschrift|Abschluss|Spesen|Kontoführung)\b/;
const PAYEE_PATTERNS: RegExp[] = [
  /^Gutschrift (.+)$/,
  /^(?:Belastung|Vergütung|Zahlung|Dauerauftrag|Lastschrift|E-Banking) (.+)$/,
];

export function extractGkbPayee(text: string): string {
  if (BANK_OWN_POSTINGS.test(text)) return 'GKB';
  for (const re of PAYEE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

/** `Saldo: CHF 21889.05` → `CHF`; '' when the line is missing. */
function metaValue(lines: string[], key: string): string {
  const line = lines.find(l => l.trim().startsWith(key));
  if (!line) return '';
  const value = parseCsvLine(line)[0] ?? '';
  return value.slice(key.length).trim();
}

export function parseGkb(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(isHeader);
  if (headerIdx < 0) {
    const first = lines.find(l => l.trim().length > 0);
    throw new BankImportError(first === undefined ? 'empty-file' : 'unknown-format', first ?? '');
  }
  const meta = lines.slice(0, headerIdx);
  const header = parseCsvLine(lines[headerIdx]);
  const col = (name: string) => header.indexOf(name);
  const cDate = col('Datum'), cText = col('Buchungstext'), cAmount = col('Betrag'), cSaldo = col('Saldo');

  const saldoMeta = /^([A-Z]{3})\b/.exec(metaValue(meta, 'Saldo:'));
  const currency = saldoMeta?.[1] ?? 'CHF';
  const dateTo = parseGkbDate(metaValue(meta, 'Kontoauszug bis:')) ?? '';

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = parseCsvLine(line);
    const lineNo = i + 1;
    const rawText = collapseWhitespace(f[cText] ?? '');
    if (/^Saldovortrag\b/.test(rawText)) continue;
    const date = parseGkbDate(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: f[cDate] ?? '' }); continue; }
    const amount = parseAmountMinor(f[cAmount] ?? '');
    if (amount === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }
    const saldo = parseAmountMinor(f[cSaldo] ?? '');
    rows.push({ date, rawText, payee: extractGkbPayee(rawText), amount, currency, bankReference: '', ...(saldo !== undefined ? { saldo } : {}), lineNo });
  }
  const newestFirst = rows.length > 1 ? rows[0].date >= rows[rows.length - 1].date : true;
  return { format: 'gkb', iban: '', currency, bankName: BANK_NAME, dateFrom: '', dateTo, rows, warnings, newestFirst };
}
