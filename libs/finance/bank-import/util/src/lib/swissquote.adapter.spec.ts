import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { checkSaldo } from './saldo.util';
import { extractSwissquotePayee, matchesSwissquoteHeader, parseSwissquote, parseSwissquoteAmount } from './swissquote.adapter';
import { BankImportError } from './types';

const text = readFileSync(join(__dirname, 'fixtures/swissquote-sample.txt'), 'utf8');

/** The same statement as the PDF-to-text tools print it: the amount tail on the last line of a block. */
const READING_ORDER = [
  'Transaktionsaufstellung',
  '01.01.2025 bis 14.09.2026 - Erstellt am 15.09.2026',
  'IBAN',
  'CH12 0878 1000 0000 1234 5',
  'Transaktionsaufstellung in CHF Max Muster',
  'IBAN: CH12 0878 1000 0000 1234 5 (CHF) 01.01.2025 bis 14.09.2026 - Erstellt am 15.09.2026',
  'Anfangssaldo',
  '60’431.00 CHF',
  'Einzahlung',
  '228’974.67 CHF',
  'Datum Referenz Information Gebühren und',
  'Steuern Betrag Valuta-Datum Saldo',
  '01.01.2025 743667086 Zinsen +0.79 CHF 31.12.2024 60’431.79 CHF',
  '17.01.2025 760840885 Manuelle Forex-Überweisung CHF an USD',
  'Wechselkurs: 1 CHF = 1.096569 USD',
  'Betrag: 30000.00 USD',
  '-27’618.21 CHF 21.01.2025 32’813.58 CHF',
  'Swissquote Bank AG, 33 chemin de la Crétaux, CH-1196 Gland - Customer Care : +41 44 825 88 88 2',
  'Alle',
  ' / 8',
  'Transaktionsaufstellung in USD Max Muster',
  'Anfangssaldo',
  '26’303.11 USD',
  '01.01.2025 745722446 Zinsen -336.54 USD 31.12.2024 25’966.57 USD',
  '19.02.2025 788176947 Verkaufen - PALANTIR TECHNOLOGIES CL A',
  'ORD',
  'Börse: NASDAQ',
  'ISIN: US69608A1088',
  'Anzahl: 126',
  'Stückpreis: 114.6 USD',
  'Betrag: 14439.60 USD',
  '55.0 USD',
  'Kommission',
  '21.66 USD',
  'Abgabe (Eidg.',
  'Stempelsteuer)',
  '0.33 USD',
  'Börsengebühren',
  '+14’362.61 USD 20.02.2025 40’329.18 USD',
].join('\n');

describe('parseSwissquote', () => {
  const s = parseSwissquote(text);
  const byCurrency = (c: string) => s.rows.filter(r => r.currency === c);

  it('detects the statement title plus date range plus IBAN; CSV layouts do not match', () => {
    expect(matchesSwissquoteHeader(splitLines(text))).toBe(true);
    expect(matchesSwissquoteHeader(splitLines(READING_ORDER))).toBe(true);
    expect(matchesSwissquoteHeader(['Transaktionsaufstellung', 'foo'])).toBe(false);
    expect(matchesSwissquoteHeader(['Datum;Buchungstext;Konto;Whg;Belastung;Gutschrift'])).toBe(false);
    expect(matchesSwissquoteHeader(['Kontoauszug bis: 01.01.2026 ;;;', 'Datum;Buchungstext;Betrag;Saldo;Valuta'])).toBe(false);
    expect(matchesSwissquoteHeader([])).toBe(false);
  });

  it('reports the IBAN, the reference currency, the date range and oldest-first order', () => {
    expect(s).toMatchObject({ format: 'swissquote', iban: 'CH1208781000000012345', currency: 'CHF', bankName: 'Swissquote', dateFrom: '20250101', dateTo: '20260914', newestFirst: false });
    expect(s.warnings).toEqual([]);
  });

  it('yields one row per transaction across the three currency sections', () => {
    expect(s.rows).toHaveLength(75);
    expect(byCurrency('CHF')).toHaveLength(26);
    expect(byCurrency('EUR')).toHaveLength(1);
    expect(byCurrency('USD')).toHaveLength(48);
    // the section totals of the PDF: Endsaldo − Anfangssaldo
    const sum = (c: string) => byCurrency(c).reduce((acc, r) => acc + r.amount, 0);
    expect(sum('CHF')).toBe(201961 - 6043100);
    expect(sum('EUR')).toBe(175812 - 176743);
    expect(sum('USD')).toBe(-3019773 - 2630311);
  });

  it('reads date, reference, signed amount, saldo and the collapsed text of a one-line row', () => {
    expect(s.rows[0]).toMatchObject({ date: '20250101', rawText: 'Zinsen', payee: 'Swissquote', amount: 79, currency: 'CHF', bankReference: '743667086', saldo: 6043179, lineNo: 29 });
    expect(s.rows[0].amountFx).toBeUndefined();
    expect(s.rows[0].fxRate).toBeUndefined();
  });

  it('takes the foreign amount and the rate of a forex transfer from the bank text', () => {
    const chf = byCurrency('CHF').find(r => r.bankReference === '760840885')!;
    expect(chf).toMatchObject({ date: '20250117', amount: -2761821, saldo: 3281358, payee: 'Swissquote', fxRate: 1.096569, amountFx: { amount: 3000000, currency: 'USD' } });
    expect(chf.rawText).toBe('Manuelle Forex-Überweisung CHF an USD Wechselkurs: 1 CHF = 1.096569 USD Betrag: 30000.00 USD');
    const usd = byCurrency('USD').find(r => r.bankReference === '760840885')!;
    expect(usd).toMatchObject({ date: '20250117', amount: 3000000, currency: 'USD', fxRate: 1.096569, amountFx: { amount: 2761821, currency: 'CHF' } });
  });

  it('keeps the fee column in the text but not as a foreign amount; the net amount is booked', () => {
    const buy = byCurrency('USD').find(r => r.bankReference === '760784559')!;
    expect(buy).toMatchObject({ date: '20250117', amount: -1652463, saldo: 944194, payee: 'SOFI TECHNOLOGIES ORD' });
    expect(buy.amountFx).toBeUndefined();
    expect(buy.rawText).toContain('Kaufen - SOFI TECHNOLOGIES ORD 80.0 USD Börse: NASDAQ Kommission');
    expect(buy.rawText).toContain('Betrag: 16629.26 USD');
  });

  it('names the counterparty of the known posting kinds', () => {
    expect(byCurrency('USD').find(r => r.bankReference === '769367712')!.payee).toBe('Ether');
    expect(byCurrency('USD').find(r => r.bankReference === '900436781')!.payee).toBe('BTC');
    expect(byCurrency('USD').find(r => r.bankReference === '788176947')!.payee).toBe('PALANTIR TECHNOLOGIES CL A');
    expect(byCurrency('CHF').find(r => r.bankReference === '766047297')!.payee).toBe('Max Muster');
    expect(byCurrency('CHF').find(r => r.bankReference === '806518707')!.payee).toBe('Muster, Max Peter');
    expect(byCurrency('CHF').find(r => r.bankReference === '817023304')!.payee).toBe('Swissquote');
    expect(byCurrency('USD').find(r => r.bankReference === '788176984')!.payee).toBe('Swissquote');
    expect(extractSwissquotePayee('Irgendwas Unbekanntes')).toBe('');
  });

  it('passes the oldest-first saldo check within every currency section', () => {
    expect(checkSaldo(s.rows, false)).toEqual([]);
    expect(checkSaldo(byCurrency('USD'), false)).toEqual([]);
  });

  it('flags a first row that does not continue the section opening balance', () => {
    const b = parseSwissquote(text.replace('60’431.00 CHF 228’974.67 CHF', '60’431.01 CHF 228’974.67 CHF'));
    expect(b.warnings).toEqual([{ code: 'saldo-mismatch', lineNo: 29, detail: '6043180/6043179' }]);
  });

  it('also reads the reading-order layout with the amount tail on the last line', () => {
    const r = parseSwissquote(READING_ORDER);
    expect(r).toMatchObject({ iban: 'CH1208781000000012345', currency: 'CHF', dateFrom: '20250101', dateTo: '20260914' });
    expect(r.warnings).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[1]).toMatchObject({ date: '20250117', amount: -2761821, saldo: 3281358, currency: 'CHF', fxRate: 1.096569, amountFx: { amount: 3000000, currency: 'USD' }, lineNo: 14 });
    expect(r.rows[3]).toMatchObject({ date: '20250219', amount: 1436261, saldo: 4032918, currency: 'USD', bankReference: '788176947', payee: 'PALANTIR TECHNOLOGIES CL A ORD' });
    expect(r.rows[3].rawText).not.toContain('+14’362.61');
    expect(r.rows[3].rawText).toContain('0.33 USD Börsengebühren');
  });

  it('skips a transaction without a readable amount tail with a warning naming its line', () => {
    const broken = text.replace('Zinsen +0.79 CHF 31.12.2024 60’431.79 CHF', 'Zinsen +x.79 CHF 31.12.2024 60’431.79 CHF');
    const b = parseSwissquote(broken);
    expect(b.rows).toHaveLength(74);
    expect(b.warnings).toEqual([{ code: 'line-skipped', lineNo: 29, detail: 'amount' }]);
  });

  it('parses typographic thousands separators', () => {
    expect(parseSwissquoteAmount('-27’618.21')).toBe(-2761821);
    expect(parseSwissquoteAmount("188'972.40")).toBe(18897240);
    expect(parseSwissquoteAmount('+0.79')).toBe(79);
    expect(parseSwissquoteAmount('abc')).toBeUndefined();
  });

  it('throws typed errors for an empty file, a foreign layout and a statement without IBAN', () => {
    expect(() => parseSwissquote('')).toThrowError(BankImportError);
    try { parseSwissquote('Datum;Buchungstext'); } catch (e) { expect((e as BankImportError).code).toBe('unknown-format'); }
    try { parseSwissquote('Transaktionsaufstellung\nTransaktionsaufstellung in CHF\n01.01.2025 1 Zinsen +0.79 CHF 31.12.2024 1.00 CHF'); } catch (e) { expect((e as BankImportError).code).toBe('no-iban'); }
  });
});
