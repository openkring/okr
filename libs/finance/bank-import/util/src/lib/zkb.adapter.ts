import { collapseWhitespace, normalizeIban, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

const HEADER = ['Datum', 'Buchungstext', 'Konto', 'Whg'];

export function matchesZkbHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = parseCsvLine(stripBom(first));
  return HEADER.every((h, i) => f[i] === h);
}

const PAYEE_PATTERNS: RegExp[] = [
  /TWINT: (.+?)(?: \+41\d+)?$/,
  /Auftraggeber: (.+?),/,
  /(?:Mobile Banking|eBanking(?: Mobile)?|eBill|Dauerauftrag|Salär|Rente): (.+?),/,
  /Belastungen (?:Mobile Banking|eBanking Mobile) \(\d+\) (.+?),/,
  /(?:Online-)?Einkauf ZKB Visa Debit Card Nr\. xxxx \d{4}, (.+)$/,
  /Bezug ZKB Visa Debit Card Nr\. xxxx \d{4}, (.+)$/,
  /Rückerstattung ZKB Visa Debit Card Nr\. xxxx \d{4}, (.+)$/,
  /Belastung aus Lastschrift mit Widerspruch: (.+?),/,
];

export function extractZkbPayee(text: string): string {
  if (/^Miete ZKB Schrankfach/.test(text)) return 'ZKB';
  for (const re of PAYEE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export function parseZkb(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerIdx < 0) throw new BankImportError('empty-file');
  const header = parseCsvLine(lines[headerIdx]);
  const col = (name: string) => header.indexOf(name);
  const cDate = col('Datum'), cText = col('Buchungstext'), cKonto = col('Konto'), cWhg = col('Whg'), cDebit = col('Belastung'), cCredit = col('Gutschrift');
  if ([cDate, cText, cKonto, cWhg, cDebit, cCredit].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  let iban = '';
  let currency = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = parseCsvLine(line);
    const rowIban = normalizeIban(f[cKonto] ?? '');
    if (!iban && rowIban) { iban = rowIban; currency = f[cWhg] || 'CHF'; }
    if (rowIban !== iban) { warnings.push({ code: 'iban-mismatch', lineNo: i + 1, detail: rowIban }); continue; }
    const date = parseDdMmYyyy(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo: i + 1, detail: f[cDate] ?? '' }); continue; }
    const credit = parseAmountMinor(f[cCredit] ?? '');
    const debit = parseAmountMinor(f[cDebit] ?? '');
    if (credit === undefined && debit === undefined) { warnings.push({ code: 'line-skipped', lineNo: i + 1, detail: 'amount' }); continue; }
    const amount = (credit ?? 0) - (debit ?? 0);
    const rawText = collapseWhitespace(f[cText] ?? '');
    rows.push({ date, rawText, payee: extractZkbPayee(rawText), amount, currency: f[cWhg] || currency, bankReference: '', lineNo: i + 1 });
  }
  if (!iban) throw new BankImportError('no-iban');
  return { format: 'zkb', iban, currency, bankName: 'Zürcher Kantonalbank', dateFrom: '', dateTo: '', rows, warnings };
}
