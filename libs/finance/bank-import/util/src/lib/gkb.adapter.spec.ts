import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { extractGkbPayee, matchesGkbHeader, parseGkb, parseGkbDate } from './gkb.adapter';
import { checkSaldo } from './saldo.util';
import { BankImportError } from './types';

const text = readFileSync(join(__dirname, 'fixtures/gkb-sample.csv'), 'utf8');

describe('parseGkb', () => {
  const s = parseGkb(text);

  it('detects the metadata block plus column header; other layouts do not match', () => {
    expect(matchesGkbHeader(splitLines(text))).toBe(true);
    expect(matchesGkbHeader(['Datum;Buchungstext;Betrag;Saldo;Valuta'])).toBe(false);
    expect(matchesGkbHeader(['Kontoauszug bis: 01.01.2026 ;;;', 'foo;bar'])).toBe(false);
    expect(matchesGkbHeader(['Datum;Buchungstext;Konto;Whg;Belastung;Gutschrift'])).toBe(false);
    expect(matchesGkbHeader([])).toBe(false);
  });

  it('reports no IBAN, the currency from the Saldo line, the statement end date and newest-first order', () => {
    expect(s).toMatchObject({ format: 'gkb', iban: '', currency: 'CHF', bankName: 'Graubündner Kantonalbank', dateFrom: '', dateTo: '20260914', newestFirst: true });
    expect(s.warnings).toEqual([]);
  });

  it('yields one booking per dated row and drops the Saldovortrag row', () => {
    expect(s.rows).toHaveLength(20);
    expect(s.rows.some(r => r.rawText.startsWith('Saldovortrag'))).toBe(false);
    expect(s.rows[s.rows.length - 1]).toMatchObject({ date: '20230330', amount: -462120, saldo: 2938020, lineNo: 32 });
  });

  it('two-digit years become 20yy; Betrag is signed; Saldo is in minor units; Valuta is ignored', () => {
    expect(s.rows[0]).toMatchObject({ date: '20260629', rawText: 'Zinsbelastung 10 123.456.704', payee: 'GKB', amount: -558000, saldo: 2188905, currency: 'CHF', bankReference: '', lineNo: 13 });
    const credit = s.rows.find(r => r.rawText.startsWith('Gutschrift Muster A.'))!;
    expect(credit).toMatchObject({ date: '20250923', amount: 4000000, saldo: 4421205, payee: 'Muster A. und/oder Muster B.' });
    expect(s.rows.find(r => r.rawText === 'Abschluss')).toMatchObject({ date: '20251231', amount: -300, payee: 'GKB' });
  });

  it('passes the newest-first saldo check end to end', () => {
    expect(checkSaldo(s.rows, true)).toEqual([]);
  });

  it('skips a row with an unreadable date or amount with a warning', () => {
    const broken = text.replace('30.03.26;Zinsbelastung', 'xx.03.26;Zinsbelastung').replace(';-3.00;', ';abc;');
    const b = parseGkb(broken);
    expect(b.rows).toHaveLength(18);
    expect(b.warnings).toEqual([
      { code: 'line-skipped', lineNo: 14, detail: 'xx.03.26' },
      { code: 'line-skipped', lineNo: 15, detail: 'amount' },
    ]);
  });

  it('throws a typed error when the column header is missing', () => {
    expect(() => parseGkb('Kontoauszug bis: 14.09.2026 ;;;\n;;;\nfoo;bar')).toThrowError(BankImportError);
    expect(() => parseGkb('')).toThrowError(BankImportError);
  });
});

describe('parseGkbDate', () => {
  it('accepts dd.mm.yy and dd.mm.yyyy, rejects the rest', () => {
    expect(parseGkbDate('29.06.26')).toBe('20260629');
    expect(parseGkbDate('1.2.24')).toBe('20240201');
    expect(parseGkbDate('14.09.2026')).toBe('20260914');
    expect(parseGkbDate('31.02.26')).toBeUndefined();
    expect(parseGkbDate('2026-09-14')).toBeUndefined();
    expect(parseGkbDate('')).toBeUndefined();
  });
});

describe('extractGkbPayee', () => {
  it('names the bank for interest and closing postings, the sender for credits', () => {
    expect(extractGkbPayee('Zinsbelastung 10 123.456.704')).toBe('GKB');
    expect(extractGkbPayee('Zinsgutschrift')).toBe('GKB');
    expect(extractGkbPayee('Abschluss')).toBe('GKB');
    expect(extractGkbPayee('Gutschrift Muster-Meier Anna oder Beat')).toBe('Muster-Meier Anna oder Beat');
    expect(extractGkbPayee('Belastung Elektrizitätswerk Stadt Chur')).toBe('Elektrizitätswerk Stadt Chur');
    expect(extractGkbPayee('Saldovortrag')).toBe('');
    expect(extractGkbPayee('')).toBe('');
  });
});
