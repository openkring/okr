import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { BankImportError } from './types';
import { extractVzPayee, matchesVzHeader, parseVz, parseVzAmount, repairVzEncoding } from './vz.adapter';

const text = readFileSync(join(__dirname, 'fixtures/vz-sample.csv'), 'utf8');

describe('parseVz', () => {
  const s = parseVz(text);

  it('detects the comma-separated header; IBAN from the rows, newest first', () => {
    expect(matchesVzHeader(splitLines(text))).toBe(true);
    expect(matchesVzHeader(['Datum;Buchungstext;Konto;Whg'])).toBe(false);
    expect(matchesVzHeader(['Buchungsdatum,Valutadatum,Auftragsnummer,Konto,Kontoalias,Buchungstext'])).toBe(false);
    expect(s).toMatchObject({ format: 'vz', iban: 'CH9300762011623852957', currency: 'CHF', bankName: 'VZ Depotbank AG', dateFrom: '', dateTo: '', newestFirst: true });
  });

  it('keeps all 12 rows without a warning', () => {
    expect(s.rows).toHaveLength(12);
    expect(s.warnings).toEqual([]);
  });

  it('Belastung negative (doubled minus ignored), Gutschrift positive, saldo and reference per row, Valuta ignored', () => {
    expect(s.rows[0]).toMatchObject({ date: '20260915', amount: -1000000, currency: 'CHF', saldo: 422255, bankReference: '90581165385263', lineNo: 2 });
    expect(s.rows[1]).toMatchObject({ date: '20260914', amount: 1000000, saldo: 1422255 });
    expect(s.rows[8]).toMatchObject({ date: '20260130', amount: -1800, saldo: 1085520 });
    expect(s.rows[s.rows.length - 1]).toMatchObject({ date: '20260105', amount: -665, lineNo: 13 });
  });

  it('repairs the double-encoded umlauts and extracts the payee', () => {
    expect(s.rows[8]).toMatchObject({ rawText: 'Gebühr Bankpaket', payee: 'VZ' });
    expect(s.rows[0]).toMatchObject({ rawText: 'Zahlungsauftrag Muster Max', payee: 'Muster Max' });
    expect(s.rows[1]).toMatchObject({ rawText: 'Gutschrift 123.456.78.901', payee: '123.456.78.901' });
    expect(s.rows[11]).toMatchObject({ rawText: 'Vergütung Muster Max', payee: 'Muster Max' });
    expect(extractVzPayee('Irgendwas anderes')).toBe('');
    expect(repairVzEncoding('Gebühr Bankpaket')).toBe('Gebühr Bankpaket');
    expect(repairVzEncoding('GebÃ¼hr Bankpaket')).toBe('Gebühr Bankpaket');
  });

  it('parses the currency-prefixed amounts', () => {
    expect(parseVzAmount("CHF --10'000.00")).toEqual({ currency: 'CHF', amount: 1000000 });
    expect(parseVzAmount("CHF 4'222.55")).toEqual({ currency: 'CHF', amount: 422255 });
    expect(parseVzAmount('EUR -18.00')).toEqual({ currency: 'EUR', amount: 1800 });
    expect(parseVzAmount('')).toBeUndefined();
    expect(parseVzAmount('CHF abc')).toBeUndefined();
  });

  it('falls back to an empty IBAN when the column is empty, so the store asks for the account', () => {
    const noIban = parseVz(text.replace(/CH93 0076 2011 6238 5295 7/g, ''));
    expect(noIban).toMatchObject({ iban: '', warnings: [] });
    expect(noIban.rows).toHaveLength(12);
  });

  it('warns on a bad date, a missing amount and a foreign IBAN; throws on a missing header', () => {
    const badDate = text.replace('14.09.2026,14.09.2026', '2026-09-14,14.09.2026');
    expect(parseVz(badDate).warnings).toEqual([{ code: 'line-skipped', lineNo: 3, detail: '2026-09-14' }]);
    const noAmount = text.replace(",CHF 10'000.00,,CHF 14'222.55", ",,,CHF 14'222.55");
    expect(parseVz(noAmount).warnings).toEqual([{ code: 'line-skipped', lineNo: 3, detail: 'amount' }]);
    const otherIban = text.replace('90564180714850,Privatkonto,Privatkonto,CH93 0076 2011 6238 5295 7', '90564180714850,Privatkonto,Privatkonto,CH12 0876 1000 0000 1234 5');
    expect(parseVz(otherIban).warnings).toEqual([{ code: 'iban-mismatch', lineNo: 3, detail: 'CH1208761000000012345' }]);
    expect(() => parseVz('Datum;Buchungstext\n1;2')).toThrowError(BankImportError);
    expect(() => parseVz('')).toThrowError(BankImportError);
  });
});
