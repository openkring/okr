import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractFx, extractPostfinancePayee, matchesPostfinanceHeader, parsePostfinance } from './postfinance.adapter';
import { splitLines } from './csv.util';

const text = readFileSync(join(__dirname, 'fixtures/postfinance-sample.csv'), 'utf8');

describe('parsePostfinance', () => {
  const s = parsePostfinance(text);

  it('detects the header and reads the metadata block', () => {
    expect(matchesPostfinanceHeader(splitLines(text))).toBe(true);
    expect(matchesPostfinanceHeader(['"Datum";"Buchungstext"'])).toBe(false);
    expect(s.format).toBe('postfinance');
    expect(s.iban).toBe('CH5109000000418858226');
    expect(s.currency).toBe('CHF');
    expect(s.bankName).toBe('PostFinance');
    expect(s.dateFrom).toBe('20250101');
    expect(s.dateTo).toBe('20251231');
  });

  it('parses 12 rows in file order, skips the broken row with a warning, ignores the disclaimer', () => {
    expect(s.rows).toHaveLength(12);
    expect(s.warnings).toEqual([{ code: 'line-skipped', lineNo: 21, detail: 'xx.13.2025' }]);
    expect(s.rows[0]).toMatchObject({ date: '20251231', amount: 97500, currency: 'CHF', payee: 'Sammelgutschrift', bankReference: '', lineNo: 9 });
    expect(s.rows[1]).toMatchObject({ date: '20251231', amount: -500, payee: 'DIE KONTOFÜHRUNG' });
    expect(s.rows[11]).toMatchObject({ date: '20250101', amount: -3 });
  });

  it('keeps the three identical BEXIO rows as three rows', () => {
    const bexio = s.rows.filter(r => r.rawText.includes('BEXIO'));
    expect(bexio).toHaveLength(3);
    expect(bexio.every(r => r.amount === -12975 && r.payee === 'BEXIO AG RAPPERSWIL SG')).toBe(true);
  });

  it('extracts the foreign amount and rate, never recomputes the CHF amount', () => {
    const fx = s.rows.find(r => r.rawText.includes('FIREFOO'))!;
    expect(fx.amount).toBe(-731);
    expect(fx.amountFx).toEqual({ amount: -900, currency: 'USD' });
    expect(fx.fxRate).toBe(0.7998);
    expect(fx.payee).toBe('FIREFOO.APP BERLIN');
  });

  it('collapses whitespace in the text and parses the apostrophe thousands separator', () => {
    const ak = s.rows.find(r => r.rawText.includes('JAHRESABRECHN 01.24'))!;
    expect(ak.rawText).not.toMatch(/ {2}/);
    expect(ak.amount).toBe(146300);
  });
});

describe('extractPostfinancePayee', () => {
  it('finds the counterparty per pattern', () => {
    expect(extractPostfinancePayee('GUTSCHRIFT AUFTRAGGEBER: GENOSSENSCHAFT KISS STÄFA GOETHESTRASSE 14 8712 STÄFA MITTEILUNGEN: X')).toBe('GENOSSENSCHAFT KISS STÄFA');
    expect(extractPostfinancePayee('GUTSCHRIFT CH24 ABSENDER: AUSGLEICHSKASSE HANDEL SCHWEIZ SCHÖNMATTSTRASSE 4 4153 REINACH BL MITTEILUNGEN: Y')).toBe('AUSGLEICHSKASSE HANDEL SCHWEIZ');
    // best effort: a street prefix such as ALTE (in ALTE TIEFENAUSTRASSE) cannot be told apart from the name; the treasurer trims the rule term
    expect(extractPostfinancePayee('LASTSCHRIFT CH3230000001876930777 SWISSCOM (SCHWEIZ) AG ALTE TIEFENAUSTRASSE 6 3050 BERN SENDER REFERENZ: 1')).toBe('SWISSCOM (SCHWEIZ) AG ALTE');
    expect(extractPostfinancePayee('LASTSCHRIFT DAUERAUFTRAG: 90-9699638 HYPOTHEKARBANK LENZBURG AG BAHNHOFSTRASSE 2 5600 LENZBURG 1 CH79 GENOSSENSCHAFT COALIST NORDSTRASSE 168 8037 ZÜRICH')).toBe('HYPOTHEKARBANK LENZBURG AG');
    expect(extractPostfinancePayee('KAUF/ONLINE-SHOPPING VOM 01.01.2025 KARTEN NR. XXXX1434 GOOGLE CLOUD KH4FLR DUBLIN')).toBe('GOOGLE CLOUD KH4FLR DUBLIN');
    expect(extractPostfinancePayee('PREIS FÜR POSTFINANCE CARD FÜR EIN JAHR IM VORAUS KARTEN NR. XXXX1434')).toBe('POSTFINANCE CARD FÜR EIN JAHR IM VORAUS');
    expect(extractPostfinancePayee('SOMETHING ELSE')).toBe('');
  });
});

describe('extractFx', () => {
  it('reads currency, amount and rate; absent → empty object', () => {
    expect(extractFx('X EUR 149.18 ZUM KURS VON 0.9509 Y')).toEqual({ amountFx: { amount: 14918, currency: 'EUR' }, fxRate: 0.9509 });
    expect(extractFx('no fx here')).toEqual({});
  });
});
