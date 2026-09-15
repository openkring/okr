import { collapseWhitespace, normalizeIban, parseAmountMinor, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

/**
 * Swissquote «Transaktionsaufstellung» (spec §4.10). Swissquote offers no CSV; the input is the text
 * extracted from the PDF, one line per visual line (text items grouped by their y position, sorted by x,
 * joined with a space — see `extractPdfLines` in the feature lib). The adapter is layout-tolerant: the
 * amount / valuta / saldo tail may sit on the first line of a transaction (y-grouped extraction) or on
 * its last line (reading-order extraction).
 *
 * One PDF holds one section per currency (`Transaktionsaufstellung in CHF|EUR|USD`) under a single
 * IBAN. Each row carries its section's currency; `currency` on the statement is the reference currency.
 * A transaction starts with `dd.mm.yyyy <reference> <information>` and ends at the next transaction,
 * a section header, a page footer or a blank line. Rows are oldest first. The amount is already net of
 * the fees listed in the «Gebühren und Steuern» column; they stay in `rawText` only.
 */
const BANK_NAME = 'Swissquote';
const START = /^(\d{2}\.\d{2}\.\d{4}) (\d{6,}) (.*)$/;
const TAIL = /([+-]\d[\d’']*\.\d{2}) ([A-Z]{3}) (\d{2}\.\d{2}\.\d{4}) (-?\d[\d’']*\.\d{2}) ([A-Z]{3})/;
const SECTION = /^Transaktionsaufstellung in ([A-Z]{3})\b/;
const RANGE = /(\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})/;
const IBAN = /\b(?:CH|LI)\d{2}(?: ?\d{4}){4} ?\d\b/;
const REFERENCE_CURRENCY = /IBAN:? ?(?:CH|LI)[\d ]+\(([A-Z]{3})\)/;
const AMOUNT_WITH_CURRENCY = /(-?\d[\d’']*\.\d{2}) ([A-Z]{3})\b/g;
const TERMINATORS: RegExp[] = [
  /^Transaktionsaufstellung\b/, /^Datum Referenz\b/, /^Gebühren und$/, /^Steuern$/,
  /^Dieses gedruckte Dokument/, /^Swissquote Bank AG,/, /^Alle$/, /^Vertriebsentschädigungen$/,
];
const FX_RATE = /Wechselkurs: 1 ([A-Z]{3}) = (\d+(?:\.\d+)?) ([A-Z]{3})/;
const FX_AMOUNT = /Betrag: (\d[\d’']*(?:\.\d+)?) ([A-Z]{3})\b/;

export function matchesSwissquoteHeader(lines: string[]): boolean {
  const first = lines.find(l => l.trim().length > 0);
  if (!first) return false;
  const head = lines.slice(0, 20);
  return /^Transaktionsaufstellung\b/.test(stripBom(first).trim())
    && head.some(l => RANGE.test(l))
    && head.some(l => IBAN.test(l) || /Swissquote/.test(l));
}

/** `+0.79` → 79, `-27’618.21` → -2761821 (explicit plus; typographic or straight apostrophes as thousands separators). */
export function parseSwissquoteAmount(value: string): number | undefined {
  return parseAmountMinor((value ?? '').trim().replace(/^\+/, '').replace(/’/g, "'"));
}

/** Bank-internal postings: the bank itself is the counterparty. */
const BANK_OWN_POSTINGS = /^(?:Zinsen\b|Depotgebühren\b|Wertpapierleihe\b|Berichtigung Börsengeb\.|Manuelle Forex-Überweisung\b)/;
/** Stops a name before the fee column (`80.0 USD`), the detail labels or the bank-address lines. */
const STOP = String.raw`(?: \d[\d’'.]* [A-Z]{3}\b| Börse:| ISIN:| Symbol:| Anzahl:| IBAN:| BIC| Kommission\b| Abgabe\b| [^ ]+,\d|$)`;
const PAYEE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`^(?:Kaufen|Verkaufen|Dividende|Coupon) - (.+?)` + STOP),
  new RegExp(String.raw`^Kryptos (?:kaufen|verkaufen) - (.+?)` + STOP),
  new RegExp(String.raw`^(?:Einzahlung|Auszahlung) für (.+?)` + STOP),
  new RegExp(String.raw`^(?:Eingehende|Ausgehende) Zahlung (.+?)` + STOP),
];
const CRYPTO_SYMBOL = /^Kryptos (?:kaufen|verkaufen)\b.*?Symbol: ([A-Z0-9]+)\b/;

export function extractSwissquotePayee(text: string): string {
  if (BANK_OWN_POSTINGS.test(text)) return BANK_NAME;
  for (const re of PAYEE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  const symbol = CRYPTO_SYMBOL.exec(text);
  return symbol?.[1] ?? '';
}

interface Block { lineNo: number; date: string; reference: string; lines: string[]; currency: string; }

/** Groups the lines into transaction blocks, remembering each section's currency and opening balance. */
function collectBlocks(lines: string[]): { blocks: Block[]; opening: Map<string, number>; sections: string[] } {
  const blocks: Block[] = [];
  const opening = new Map<string, number>();
  const sections: string[] = [];
  let currency = '';
  let current: Block | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const section = SECTION.exec(line);
    if (section) {
      currency = section[1];
      if (!sections.includes(currency)) sections.push(currency);
      current = undefined;
      continue;
    }
    const start = START.exec(line);
    if (start && currency) {
      current = { lineNo: i + 1, date: start[1], reference: start[2], lines: [start[3]], currency };
      blocks.push(current);
      continue;
    }
    if (line.length === 0 || TERMINATORS.some(t => t.test(line))) { current = undefined; continue; }
    if (currency && !opening.has(currency) && /^Anfangssaldo\b/.test(line)) {
      // y-grouped layout: the value is on the next line; reading-order layout: on the same or next line.
      const window = `${line} ${lines[i + 1] ?? ''}`;
      for (const m of window.matchAll(AMOUNT_WITH_CURRENCY)) {
        if (m[2] === currency) { const v = parseSwissquoteAmount(m[1]); if (v !== undefined) opening.set(currency, v); break; }
      }
      continue;
    }
    if (current) current.lines.push(line);
  }
  return { blocks, opening, sections };
}

export function parseSwissquote(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text ?? ''));
  const first = lines.find(l => l.trim().length > 0);
  if (first === undefined) throw new BankImportError('empty-file');
  const { blocks, opening, sections } = collectBlocks(lines);
  if (sections.length === 0) throw new BankImportError('unknown-format', first.slice(0, 80));
  const firstMatch = (re: RegExp): RegExpExecArray | undefined => {
    for (const l of lines) { const m = re.exec(l); if (m) return m; }
    return undefined;
  };
  const ibanMatch = firstMatch(IBAN);
  if (!ibanMatch) throw new BankImportError('no-iban');
  const iban = normalizeIban(ibanMatch[0]);
  const currency = firstMatch(REFERENCE_CURRENCY)?.[1] ?? sections[0];
  const range = firstMatch(RANGE);
  const dateFrom = range ? parseDdMmYyyy(range[1]) ?? '' : '';
  const dateTo = range ? parseDdMmYyyy(range[2]) ?? '' : '';

  const warnings: ParsedWarning[] = [];
  const rows: ParsedRow[] = [];
  const seenSection = new Set<string>();
  for (const b of blocks) {
    const firstOfSection = !seenSection.has(b.currency);
    seenSection.add(b.currency);
    const joined = b.lines.join('\n');
    const tail = TAIL.exec(joined);
    const date = parseDdMmYyyy(b.date);
    if (!tail || !date) { warnings.push({ code: 'line-skipped', lineNo: b.lineNo, detail: tail ? b.date : 'amount' }); continue; }
    const amount = parseSwissquoteAmount(tail[1]);
    const saldo = parseSwissquoteAmount(tail[4]);
    if (amount === undefined || saldo === undefined) { warnings.push({ code: 'line-skipped', lineNo: b.lineNo, detail: 'amount' }); continue; }
    if (tail[2] !== b.currency) warnings.push({ code: 'currency-mismatch', lineNo: b.lineNo, detail: `${tail[2]}/${b.currency}` });
    const rawText = collapseWhitespace(joined.replace(tail[0], ' '));
    const row: ParsedRow = { date, rawText, payee: extractSwissquotePayee(rawText), amount, currency: b.currency, bankReference: b.reference, saldo, lineNo: b.lineNo };
    const fx = FX_RATE.exec(rawText);
    const fxAmount = FX_AMOUNT.exec(rawText);
    if (fx) row.fxRate = Number(fx[2]);
    if (fxAmount && fxAmount[2] !== b.currency) {
      const v = parseSwissquoteAmount(fxAmount[1]);
      if (v !== undefined) row.amountFx = { amount: v, currency: fxAmount[2] };
    }
    if (firstOfSection) {
      const open = opening.get(b.currency);
      if (open !== undefined && open + amount !== saldo) warnings.push({ code: 'saldo-mismatch', lineNo: b.lineNo, detail: `${open + amount}/${saldo}` });
    }
    rows.push(row);
  }
  return { format: 'swissquote', iban, currency, bankName: BANK_NAME, dateFrom, dateTo, rows, warnings, newestFirst: false };
}
