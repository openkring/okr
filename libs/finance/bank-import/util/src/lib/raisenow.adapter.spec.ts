import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { detectFormat, parseStatement } from './format-registry';
import { computeImportKeys } from './import-key.util';
import { matchesRaisenowHeader, parseRaisenow, raisenowIban } from './raisenow.adapter';

const text = readFileSync(join(__dirname, 'fixtures/raisenow-sample.csv'), 'utf8');
const HEADER = splitLines(text)[0];

/** One synthetic record with the fixture's column layout, for the cases the real export does not contain. */
function lineWith(patch: Record<string, string>): string {
  const header = HEADER.replace(/^﻿/, '').split(',');
  const base = splitLines(text)[1].split(',');
  Object.entries(patch).forEach(([name, value]) => { base[header.indexOf(name)] = value; });
  return base.join(',');
}
const fileOf = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe('parseRaisenow', () => {
  const s = parseRaisenow(text);

  it('detects the comma-separated header and is registered as a format', () => {
    expect(matchesRaisenowHeader(splitLines(text))).toBe(true);
    expect(matchesRaisenowHeader(['Identifikationsnummer;Erstellt;UTC-Offset;Status;Betrag'])).toBe(false);
    expect(matchesRaisenowHeader(['Datum;Bewegungstyp;Avisierungstext'])).toBe(false);
    expect(detectFormat(text)).toBe('raisenow');
    expect(parseStatement(text).format).toBe('raisenow');
  });

  it('is a statement on the pseudo-IBAN, newest first, with the window taken from the rows', () => {
    expect(s).toMatchObject({
      format: 'raisenow', bankName: 'RaiseNow', currency: 'CHF', newestFirst: true,
      iban: 'RAISENOW-0a49a1d9-7254-443e', dateFrom: '20260320', dateTo: '20260913',
    });
    expect(s.iban.length).toBeGreaterThanOrEqual(15);   // bankProfileValidations: 15..34
    expect(s.iban.length).toBeLessThanOrEqual(34);
  });

  it('keeps all ten rows without a warning', () => {
    expect(s.rows).toHaveLength(10);
    expect(s.warnings).toEqual([]);
  });

  it('books the GROSS amount and carries the fee; the date comes from `Erstellt`, the reference is the transaction id', () => {
    expect(s.rows[0]).toMatchObject({
      date: '20260913', amount: 9300, fee: 233, currency: 'CHF',
      bankReference: 'd2350b3a-0d48-4d8a-ac97-bfca4947056c', payee: 'Anna Muster', lineNo: 2,
    });
    expect(s.rows[2]).toMatchObject({ date: '20260829', amount: 46500, fee: 1163 });
    expect(s.rows[4]).toMatchObject({ amount: 15196, fee: 380 });
  });

  it('treats a covered fee exactly like a deducted one (D-RN-3)', () => {
    const covered = s.rows[6];
    const deducted = s.rows[5];
    expect(covered).toMatchObject({ amount: 256, fee: 6 });      // 2.56 − 0.06 = 2.50 net
    expect(deducted).toMatchObject({ amount: 500, fee: 13 });    // 5.00 − 0.13 = 4.87 net
    // net is never stored: it is amount − fee in both cases
    expect(covered.amount - (covered.fee ?? 0)).toBe(250);
    expect(deducted.amount - (deducted.fee ?? 0)).toBe(487);
  });

  it('puts the touchpoint into rawText so bank rules can map it, and survives an anonymous donation', () => {
    expect(s.rows[0].rawText).toBe('RaiseNow SCS Twint JB twint_qr_payments twint');
    expect(s.rows[5].rawText).toBe('RaiseNow Seeclub Stäfa Bootshaus twint_qr_donations twint');
    expect(s.rows[5].payee).toBe('');
  });

  it('drops every row that is not `succeeded`, with one warning naming the status', () => {
    const one = parseRaisenow(fileOf(lineWith({ Status: 'failed' }), lineWith({})));
    expect(one.rows).toHaveLength(1);
    expect(one.warnings).toEqual([{ code: 'line-skipped', lineNo: 2, detail: 'failed' }]);
  });

  it('warns but still imports when Nettobetrag ≠ Betrag − Gebühr', () => {
    const one = parseRaisenow(fileOf(lineWith({ Nettobetrag: '80.00' })));
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]).toMatchObject({ amount: 9300, fee: 233 });
    expect(one.warnings[0]).toMatchObject({ code: 'saldo-mismatch', lineNo: 2 });
  });

  it('ignores a fee stated in another currency rather than mixing currencies', () => {
    const one = parseRaisenow(fileOf(lineWith({ 'Währung der Gebühr': 'EUR' })));
    expect(one.rows[0].fee).toBe(0);
    expect(one.warnings[0]).toMatchObject({ code: 'currency-mismatch', lineNo: 2 });
  });

  it('reads the converted amount as amountFx only when both columns are set', () => {
    expect(parseRaisenow(fileOf(lineWith({ 'Umgerechneter Betrag': '100.00' }))).rows[0].amountFx).toBeUndefined();
    expect(parseRaisenow(fileOf(lineWith({ 'Umgerechneter Betrag': '100.00', 'Umgerechnete Währung': 'EUR' }))).rows[0].amountFx)
      .toEqual({ amount: 10000, currency: 'EUR' });
  });

  it('resolves columns by name, not by position', () => {
    const header = HEADER.replace(/^﻿/, '').split(',');
    const moved = [...header.slice(0, 5), 'Neue Spalte', ...header.slice(5)].join(',');
    const row = splitLines(text)[1].split(',');
    const movedRow = [...row.slice(0, 5), 'x', ...row.slice(5)].join(',');
    expect(parseRaisenow([moved, movedRow].join('\n')).rows[0]).toMatchObject({ amount: 9300, fee: 233, payee: 'Anna Muster' });
  });

  it('ignores the UTC offset: the stamp is local wall clock', () => {
    expect(parseRaisenow(fileOf(lineWith({ 'UTC-Offset': '-08:00' }))).rows[0].date).toBe('20260913');
  });
});

describe('raisenowIban', () => {
  it('prefixes 18 characters of the constant account id, and yields "" without one', () => {
    expect(raisenowIban('0a49a1d9-7254-443e-a326-d0d36cecce8e')).toBe('RAISENOW-0a49a1d9-7254-443e');
    expect(raisenowIban('')).toBe('');
  });
});

describe('import keys', () => {
  it('are stable across two exports that overlap', async () => {
    const s = parseRaisenow(text);
    const input = (rows: typeof s.rows) => rows.map(r => ({ iban: s.iban, date: r.date, amount: r.amount, bankReference: r.bankReference, rawText: r.rawText }));
    const all = await computeImportKeys(input(s.rows));
    const overlap = await computeImportKeys(input(s.rows.slice(3)));
    expect(overlap).toEqual(all.slice(3));
    expect(new Set(all).size).toBe(all.length);
  });
});
