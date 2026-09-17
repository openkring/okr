import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bonuscardIban, isBonuscardPayment, matchesBonuscardHeader, parseBonuscard } from './bonuscard.adapter';
import { splitLines } from './csv.util';
import { detectFormat, parseStatement } from './format-registry';

const text = readFileSync(join(__dirname, 'fixtures/bonuscard-sample.csv'), 'utf8');
const HEADER = splitLines(text)[0];
const fileOf = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('parseBonuscard', () => {
  const s = parseBonuscard(text);

  it('detects its header without depending on the one non-ASCII column name', () => {
    expect(matchesBonuscardHeader(splitLines(text))).toBe(true);
    expect(matchesBonuscardHeader(['Datum,Beschreibung,Karte,Whrung,Betrag,Status'])).toBe(true);
    expect(matchesBonuscardHeader(['Datum;Bewegungstyp;Avisierungstext'])).toBe(false);
    expect(matchesBonuscardHeader(['Buchungsdatum,Valutadatum,Auftragsnummer,Konto'])).toBe(false);
    expect(detectFormat(text)).toBe('bonuscard');
    expect(parseStatement(text).format).toBe('bonuscard');
  });

  it('is a statement on the masked card, newest first, window from the rows', () => {
    expect(s).toMatchObject({
      format: 'bonuscard', bankName: 'Bonuscard', currency: 'CHF', newestFirst: true,
      iban: 'BONUSCARD-XXXX1234', dateFrom: '20260101', dateTo: '20260903',
    });
    expect(s.iban.length).toBeGreaterThanOrEqual(15);   // bankProfileValidations: 15..34
    expect(s.iban.length).toBeLessThanOrEqual(34);
  });

  it('INVERTS the sign: a purchase is a Lastschrift on the liability account', () => {
    expect(s.rows[0]).toMatchObject({ date: '20260903', amount: -3000, rawText: 'APPLE.COM/BILL', payee: 'APPLE.COM/BILL', bankReference: '', lineNo: 2 });
    expect(s.rows.every(r => r.rawText === 'Rundung' || r.amount < 0)).toBe(true);
  });

  it('turns a Rundung credit into a Gutschrift that reduces the debt, with no payee', () => {
    const rundung = s.rows.filter(r => r.rawText === 'Rundung');
    expect(rundung).toHaveLength(2);
    expect(rundung[0]).toMatchObject({ date: '20260715', amount: 2, payee: '' });
    expect(rundung[1]).toMatchObject({ date: '20260515', amount: 3, payee: '' });
  });

  it('DROPS every "Ihre Zahlung" row and says so — the bank statement books that leg (D-BI-18)', () => {
    expect(s.rows.some(r => isBonuscardPayment(r.rawText))).toBe(false);
    const dropped = s.warnings.filter(w => w.detail === 'Ihre Zahlung');
    expect(dropped).toHaveLength(3);
    expect(dropped[0]).toMatchObject({ code: 'line-skipped', lineNo: 6 });
    expect(s.rows).toHaveLength(11);   // 14 rows − 3 payments
  });

  it('drops a payment row whatever its sign: a reversal is on the bank statement too', () => {
    expect(parseBonuscard(fileOf('21/08/2026,Ihre Zahlung,,CHF,255.15,Verarbeitete Transaktion')).rows).toHaveLength(0);
    expect(parseBonuscard(fileOf('21/08/2026,Ihre Zahlung - besten Dank,,CHF,-255.15,Verarbeitete Transaktion')).rows).toHaveLength(0);
  });

  it('collapses the double space merchants are padded with, so a rule term matches', () => {
    expect(s.rows[1].rawText).toBe('WHOP*FELIX FRIENDS');
  });

  it('skips a row that is not a processed transaction, naming the status', () => {
    const one = parseBonuscard(fileOf('03/09/2026,APPLE.COM/BILL,**1234,CHF,30.00,Vorgemerkt', '01/01/2026,CHARGEMAP,**1234,CHF,2.63,Verarbeitete Transaktion'));
    expect(one.rows).toHaveLength(1);
    expect(one.warnings).toEqual([{ code: 'line-skipped', lineNo: 2, detail: 'Vorgemerkt' }]);
  });

  it('carries no saldo and no reference — the occurrence index separates identical rows', () => {
    const two = parseBonuscard(fileOf('02/09/2026,APPLE.COM/BILL,**1234,CHF,10.00,Verarbeitete Transaktion', '02/09/2026,APPLE.COM/BILL,**1234,CHF,10.00,Verarbeitete Transaktion'));
    expect(two.rows).toHaveLength(2);
    expect(two.rows.every(r => r.saldo === undefined && r.bankReference === '')).toBe(true);
  });
});

describe('bonuscardIban', () => {
  it('keeps only the last four digits of the masked PAN, and yields "" without a card', () => {
    expect(bonuscardIban('**7005')).toBe('BONUSCARD-XXXX7005');
    expect(bonuscardIban('**** **** **** 7005')).toBe('BONUSCARD-XXXX7005');
    expect(bonuscardIban('')).toBe('');
  });
});
