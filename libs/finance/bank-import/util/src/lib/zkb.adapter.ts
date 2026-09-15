import { collapseWhitespace, normalizeIban, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/** Current export (spec §4.6): one flattened row per booking, IBAN in the Konto column, no saldo. */
const HEADER = ['Datum', 'Buchungstext', 'Konto', 'Whg'];
/** Legacy export: no Konto column, running Saldo, ZKB-Referenz, and Sammelbuchungen as a dated header row followed by dateless detail rows. */
const LEGACY_HEADER = ['Datum', 'Buchungstext', 'Whg', 'Betrag Detail', 'ZKB-Referenz'];

const BANK_NAME = 'Zürcher Kantonalbank';

function startsWith(fields: string[], header: string[]): boolean {
  return header.every((h, i) => fields[i] === h);
}

export function matchesZkbHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const f = parseCsvLine(stripBom(first));
  return startsWith(f, HEADER) || startsWith(f, LEGACY_HEADER);
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
  if (startsWith(header, LEGACY_HEADER)) return parseZkbLegacy(lines, headerIdx, header);

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
  return { format: 'zkb', iban, currency, bankName: BANK_NAME, dateFrom: '', dateTo: '', rows, warnings, newestFirst: true };
}

/** A dated row that may be followed by dateless detail rows (a Sammelbuchung). */
interface PendingCollective {
  row: ParsedRow;
  headerText: string;
  details: ParsedRow[];
}

/**
 * Legacy ZKB layout. No IBAN in the file (`iban = ''`, the caller resolves the profile another way).
 * Every dated row carries the running `Saldo CHF` and the `ZKB-Referenz`. A collective payment is a
 * dated header row (total amount, saldo, reference) followed by dateless detail rows (`Betrag Detail`,
 * `Zahlungszweck`). The details become the bookings when they add up to the header's total — each gets
 * the header's date and reference, a running saldo, and the header text as prefix so the payee pattern
 * for flattened collectives applies. Otherwise the header stays one booking and the details are dropped
 * with a warning. Row order (usually oldest first) is derived from the first and last date.
 */
function parseZkbLegacy(lines: string[], headerIdx: number, header: string[]): ParsedStatement {
  const col = (name: string) => header.indexOf(name);
  const cDate = col('Datum'), cText = col('Buchungstext'), cWhg = col('Whg'), cDetail = col('Betrag Detail'), cRef = col('ZKB-Referenz'), cPurpose = col('Zahlungszweck');
  const cDebit = header.findIndex(h => /^Belastung [A-Z]{3}$/.test(h));
  const cCredit = header.findIndex(h => /^Gutschrift [A-Z]{3}$/.test(h));
  const cSaldo = header.findIndex(h => /^Saldo [A-Z]{3}$/.test(h));
  if ([cDate, cText, cWhg, cDetail, cRef, cDebit, cCredit, cSaldo].some(c => c < 0)) throw new BankImportError('unknown-format', lines[headerIdx]);
  const currency = header[cDebit].slice(-3);

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  let pending: PendingCollective | undefined;

  const flush = (): void => {
    if (!pending) return;
    const { row, headerText, details } = pending;
    pending = undefined;
    if (details.length === 0) { rows.push(row); return; }
    const sum = details.reduce((acc, d) => acc + d.amount, 0);
    if (sum !== row.amount) {
      warnings.push({ code: 'line-skipped', lineNo: row.lineNo, detail: `Sammelbuchung ${Math.abs(sum)}/${Math.abs(row.amount)}` });
      rows.push(row);
      return;
    }
    // running saldo: the header's saldo is the balance after the last detail (oldest-first order)
    let saldo = row.saldo ?? 0;
    for (let k = details.length - 1; k >= 0; k--) {
      const d = details[k];
      const rawText = collapseWhitespace(`${headerText} ${d.rawText}`);
      details[k] = { ...d, rawText, payee: extractZkbPayee(rawText), ...(row.saldo !== undefined ? { saldo } : {}) };
      saldo -= d.amount;
    }
    rows.push(...details);
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const f = parseCsvLine(line);
    const lineNo = i + 1;
    const purpose = collapseWhitespace(f[cPurpose] ?? '');
    const textWithPurpose = collapseWhitespace(`${f[cText] ?? ''} ${purpose}`);

    if ((f[cDate] ?? '').trim().length === 0) {
      // dateless detail row of the pending collective
      const detailAmount = parseAmountMinor(f[cDetail] ?? '');
      if (!pending || detailAmount === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'Sammelbuchung' }); continue; }
      const sign = pending.row.amount < 0 ? -1 : 1;
      pending.details.push({ date: pending.row.date, rawText: textWithPurpose, payee: '', amount: sign * detailAmount,
        currency: f[cWhg] || currency, bankReference: pending.row.bankReference, lineNo });
      continue;
    }

    flush();
    const date = parseDdMmYyyy(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo, detail: f[cDate] ?? '' }); continue; }
    const credit = parseAmountMinor(f[cCredit] ?? '');
    const debit = parseAmountMinor(f[cDebit] ?? '');
    if (credit === undefined && debit === undefined) { warnings.push({ code: 'line-skipped', lineNo, detail: 'amount' }); continue; }
    const amount = (credit ?? 0) - (debit ?? 0);
    const saldo = parseAmountMinor(f[cSaldo] ?? '');
    const row: ParsedRow = { date, rawText: textWithPurpose, payee: extractZkbPayee(textWithPurpose), amount, currency,
      bankReference: (f[cRef] ?? '').trim(), ...(saldo !== undefined ? { saldo } : {}), lineNo };
    pending = { row, headerText: collapseWhitespace(f[cText] ?? ''), details: [] };
  }
  flush();

  const newestFirst = rows.length > 1 ? rows[0].date > rows[rows.length - 1].date : true;
  return { format: 'zkb', iban: '', currency, bankName: BANK_NAME, dateFrom: '', dateTo: '', rows, warnings, newestFirst };
}
