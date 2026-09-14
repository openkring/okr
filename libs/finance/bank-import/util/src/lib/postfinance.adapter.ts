import { collapseWhitespace, normalizeIban, parseAmountMinor, parseCsvLine, parseDdMmYyyy, splitLines, stripBom } from './csv.util';
import { BankImportError, ParsedRow, ParsedStatement, ParsedWarning } from './types';

const HEADER_PREFIX = 'Datum;Bewegungstyp;Avisierungstext';

export function matchesPostfinanceHeader(lines: string[]): boolean {
  return lines.some(l => stripBom(l).startsWith(HEADER_PREFIX));
}

/** `USD 9.00 ZUM KURS VON 0.7998` → amountFx/fxRate. The CHF amount stays the bank's. */
export function extractFx(text: string): { amountFx?: { amount: number; currency: string }; fxRate?: number } {
  const m = /\b([A-Z]{3}) (\d[\d']*\.\d\d) ZUM KURS VON (\d+\.\d+)/.exec(text);
  if (!m) return {};
  const amount = parseAmountMinor(m[2]);
  if (amount === undefined) return {};
  return { amountFx: { amount, currency: m[1] }, fxRate: Number(m[3]) };
}

const STREET = '(?:[A-ZÄÖÜ.\\-]*STRASSE|[A-ZÄÖÜ.\\-]*STR\\.|POSTFACH|[A-ZÄÖÜ.\\-]*PLATZ|[A-ZÄÖÜ.\\-]*WEG|[A-ZÄÖÜ.\\-]*GASSE)';
const STOP = `(?: ${STREET}\\b| \\d{4} | MITTEILUNGEN:| REFERENZEN:| SENDER REFERENZ|$)`;

const PAYEE_PATTERNS: RegExp[] = [
  new RegExp(`AUFTRAGGEBER: (.+?)${STOP}`),
  new RegExp(`ABSENDER: (.+?)${STOP}`),
  new RegExp(`LASTSCHRIFT (?:DAUERAUFTRAG: [\\d-]+ )?(?:CH\\d{19} )?(.+?)${STOP}`),
  /PREIS FÜR (.+?)(?: URSPRUNGS-KONTONUMMER| KARTEN NR|$)/,
  /KARTEN NR\. XXXX\d{4} (.+)$/,
];

export function extractPostfinancePayee(text: string): string {
  if (/^SAMMELGUTSCHRIFT/.test(text)) return 'Sammelgutschrift';
  for (const re of PAYEE_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function metaValue(fields: string[]): string {
  // `Konto:;="CH51…"` → parseCsvLine gives ['Konto:', '=CH51…']
  return (fields[1] ?? '').replace(/^=/, '').replace(/^"|"$/g, '').trim();
}

export function parsePostfinance(text: string): ParsedStatement {
  const lines = splitLines(stripBom(text));
  const headerIdx = lines.findIndex(l => l.startsWith(HEADER_PREFIX));
  if (headerIdx < 0) throw new BankImportError('unknown-format', lines[0] ?? '');

  let iban = '';
  let currency = 'CHF';
  let dateFrom = '';
  let dateTo = '';
  for (const line of lines.slice(0, headerIdx)) {
    const f = parseCsvLine(line);
    switch (f[0]) {
      case 'Konto:': iban = normalizeIban(metaValue(f)); break;
      case 'Währung:': currency = metaValue(f) || 'CHF'; break;
      case 'Datum von:': dateFrom = parseDdMmYyyy(metaValue(f)) ?? ''; break;
      case 'Datum bis:': dateTo = parseDdMmYyyy(metaValue(f)) ?? ''; break;
    }
  }
  if (!iban) throw new BankImportError('no-iban');

  const header = parseCsvLine(lines[headerIdx]);
  const col = (name: string) => header.findIndex(h => h.startsWith(name));
  const cDate = col('Datum'), cText = col('Avisierungstext'), cCredit = col('Gutschrift'), cDebit = col('Lastschrift'), cSaldo = col('Saldo');
  const warnings: ParsedWarning[] = [];
  const headerCurrency = /in ([A-Z]{3})/.exec(header[cCredit] ?? '')?.[1];
  if (headerCurrency && headerCurrency !== currency) warnings.push({ code: 'currency-mismatch', lineNo: headerIdx + 1, detail: headerCurrency });

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    if (line.startsWith('Disclaimer:')) break;
    const f = parseCsvLine(line);
    const date = parseDdMmYyyy(f[cDate] ?? '');
    if (!date) { warnings.push({ code: 'line-skipped', lineNo: i + 1, detail: f[cDate] ?? '' }); continue; }
    const credit = parseAmountMinor(f[cCredit] ?? '');
    const debit = parseAmountMinor(f[cDebit] ?? '');
    const amount = credit ?? debit;
    if (amount === undefined) { warnings.push({ code: 'line-skipped', lineNo: i + 1, detail: 'amount' }); continue; }
    const rawText = collapseWhitespace(f[cText] ?? '');
    const fx = extractFx(rawText);
    const saldo = cSaldo >= 0 ? parseAmountMinor(f[cSaldo] ?? '') : undefined;
    rows.push({
      date, rawText, payee: extractPostfinancePayee(rawText), amount, currency,
      ...(fx.amountFx ? { amountFx: { amount: Math.sign(amount) * Math.abs(fx.amountFx.amount), currency: fx.amountFx.currency }, fxRate: fx.fxRate } : {}),
      bankReference: '', ...(saldo !== undefined ? { saldo } : {}), lineNo: i + 1,
    });
  }
  return { format: 'postfinance', iban, currency, bankName: 'PostFinance', dateFrom, dateTo, rows, warnings };
}
