import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { splitLines } from './csv.util';
import { detectFormat, parseStatement } from './format-registry';
import {
  extractCardFx, extractPostfinanceCardPayee, matchesPostfinanceCardHeader,
  parseBillingPeriod, parsePostfinanceCard, postfinanceCardIban,
} from './postfinance-card.adapter';

const text = readFileSync(join(__dirname, 'fixtures/postfinance-card-sample.csv'), 'utf8');
const META = splitLines(text).slice(0, 4);
const fileOf = (...rows: string[]) => [...META, ...rows].join('\n');

describe('parsePostfinanceCard', () => {
  const s = parsePostfinanceCard(text);

  it('detects the card export and never collides with the PostFinance account export', () => {
    expect(matchesPostfinanceCardHeader(splitLines(text))).toBe(true);
    expect(matchesPostfinanceCardHeader(['Datum;Bewegungstyp;Avisierungstext;Gutschrift in CHF'])).toBe(false);
    expect(matchesPostfinanceCardHeader(['Datum,Beschreibung,Karte,Währung,Betrag,Status'])).toBe(false);
    expect(detectFormat(text)).toBe('postfinance-card');
    expect(parseStatement(text).format).toBe('postfinance-card');
  });

  it('is a statement on the masked card, newest first, window from the Rechnungsperiode', () => {
    expect(s).toMatchObject({
      format: 'postfinance-card', bankName: 'PostFinance Card', currency: 'CHF', newestFirst: true,
      iban: 'PFCARD-XXXX3043', dateFrom: '20221228', dateTo: '20230129',
    });
    expect(s.iban.length).toBeGreaterThanOrEqual(15);   // bankProfileValidations: 15..34
    expect(s.iban.length).toBeLessThanOrEqual(34);
  });

  it('reads ISO dates — the account export\'s dd.mm.yyyy parser would drop every row', () => {
    expect(s.rows.map(r => r.date)).toEqual([
      '20230122', '20230116', '20230105', '20230101', '20230101', '20230101', '20230101', '20221230',
    ]);
  });

  it('INVERTS the sign: a Lastschrift is a purchase and a debt increase on the liability account', () => {
    expect(s.rows[0]).toMatchObject({ date: '20230122', amount: -2764, payee: 'IONIC STUDIO', bankReference: '', lineNo: 5 });
    expect(s.rows.every(r => r.amount < 0)).toBe(true);
  });

  it('turns a Gutschrift into a debt-reducing positive amount', () => {
    const refund = parsePostfinanceCard(fileOf('2023-01-20;"MIGROS                   ZUERICH      CHE";12.50;;'));
    expect(refund.rows).toEqual([expect.objectContaining({ amount: 1250, payee: 'MIGROS' })]);
  });

  it('DROPS the card payment — the bank statement books that leg (D-BI-18)', () => {
    expect(s.rows.some(r => /ZAHLUNG/.test(r.rawText))).toBe(false);
    expect(s.warnings).toContainEqual({ code: 'line-skipped', lineNo: 6, detail: '2002 CH-DD ZAHLUNG' });
    expect(parsePostfinanceCard(fileOf('2023-01-19;"IHRE ZAHLUNG - BESTEN DANK";91.05;;')).rows).toHaveLength(0);
  });

  it('drops the payment only on a CREDIT row, so a debit is never silently lost', () => {
    const debit = parsePostfinanceCard(fileOf('2023-01-19;"2002 CH-DD ZAHLUNG";;91.05;'));
    expect(debit.rows).toEqual([expect.objectContaining({ amount: -9105 })]);
  });

  it('keeps a merchant whose name merely starts with the same letters', () => {
    const keep = parsePostfinanceCard(fileOf('2023-01-19;"ZAHLUNGSDIENST AG        BERN         CHE";4.00;;'));
    expect(keep.rows).toEqual([expect.objectContaining({ amount: 400, payee: 'ZAHLUNGSDIENST AG' })]);
  });

  it('DROPS Saldovortrag and the trailing Total, whose date lies outside the period', () => {
    expect(s.rows.some(r => /Saldovortrag|^Total$/.test(r.rawText))).toBe(false);
    expect(s.warnings).toContainEqual({ code: 'line-skipped', lineNo: 14, detail: 'Saldovortrag' });
    expect(s.warnings).toContainEqual({ code: 'line-skipped', lineNo: 15, detail: 'Total' });
    expect(s.rows).toHaveLength(8);   // 11 transaction lines − payment − Saldovortrag − Total
  });

  it('sums to the Total line it drops — the file states the period movement itself', () => {
    // Saldovortrag 91.05 and the payment 91.05 cancel; what remains is the period's own charges.
    expect(s.rows.reduce((sum, r) => sum + r.amount, 0)).toBe(-8326);   // Total: -83.26
  });

  it('carries the FX amount and rate, signed like the CHF amount', () => {
    expect(s.rows[0]).toMatchObject({ amountFx: { amount: -2900, currency: 'USD' }, fxRate: 0.9372 });
    expect(s.rows[1]).toMatchObject({ amountFx: { amount: -1077, currency: 'EUR' }, fxRate: 1.0195 });
  });

  it('leaves the Bearbeitungszuschlag inside the amount — the card is charged the gross', () => {
    expect(s.rows[0].amount).toBe(-2764);       // 27.18 merchant + 0.46 surcharge
    expect(s.rows.every(r => r.fee === undefined)).toBe(true);
  });

  it('keeps a domestic charge that carries no FX block', () => {
    expect(s.rows[2]).toMatchObject({ date: '20230105', amount: -2000, payee: 'Digitec Galaxus (Online)' });
    expect(s.rows[2].amountFx).toBeUndefined();
    expect(s.rows[2].fxRate).toBeUndefined();
  });

  it('carries no saldo and no reference — the occurrence index separates identical rows', () => {
    const two = parsePostfinanceCard(fileOf('2023-01-05;"CLOUD HPKL7C             Dublin       IRL";;1.42;', '2023-01-05;"CLOUD HPKL7C             Dublin       IRL";;1.42;'));
    expect(two.rows).toHaveLength(2);
    expect(two.rows.every(r => r.saldo === undefined && r.bankReference === '')).toBe(true);
  });

  it('refuses a file without a card number rather than importing it against nothing', () => {
    expect(() => parsePostfinanceCard('Kartenkonto:;\nKarte:;XXXX\nDatum;Bezeichnung;Gutschrift in CHF;Lastschrift in CHF\n')).toThrow(/no-iban/);
    expect(() => parsePostfinanceCard('Kartenkonto:;0000\nirgendwas\n')).toThrow(/unknown-format/);
  });
});

describe('extractPostfinanceCardPayee', () => {
  it('reads the 25-char merchant column, ignoring city, country and FX detail', () => {
    expect(extractPostfinanceCardPayee('GOOGLE*GSUITE BKAISER.   DUBLIN 2     IRL EUR 11.20 Kurs 1.0041')).toBe('GOOGLE*GSUITE BKAISER.');
    expect(extractPostfinanceCardPayee('IMGIX                    HTTPSWWW.IMGIUSA USD 3.08 Kurs 0.9415')).toBe('IMGIX');
  });

  it('yields "" for a bank fee line that has no merchant column at all', () => {
    expect(extractPostfinanceCardPayee('6006 ZUSCHLAG CHF IM AUSLAND')).toBe('');
    expect(extractPostfinanceCardPayee('2002 CH-DD ZAHLUNG')).toBe('');
    expect(extractPostfinanceCardPayee('')).toBe('');
  });

  it('still finds a merchant that fills its column, because the country code marks the shape', () => {
    expect(extractPostfinanceCardPayee('ABCDEFGHIJKLMNOPQRSTUVWXYZURICHSTADTXXCHE')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXY');
  });
});

describe('postfinanceCardIban', () => {
  it('keeps only the last four digits of the masked PAN, and yields "" without a card', () => {
    expect(postfinanceCardIban('XXXX XXXX XXXX 3043 PostFinance Visa Business Card')).toBe('PFCARD-XXXX3043');
    expect(postfinanceCardIban('0000 8001 0188 2804')).toBe('PFCARD-XXXX0000');
    expect(postfinanceCardIban('XXXX')).toBe('');
  });
});

describe('parseBillingPeriod', () => {
  it('splits the two ends and tolerates a missing or malformed line', () => {
    expect(parseBillingPeriod('28.12.2022 - 29.01.2023')).toEqual(['20221228', '20230129']);
    expect(parseBillingPeriod('')).toEqual(['', '']);
    expect(parseBillingPeriod('Januar 2023')).toEqual(['', '']);
  });
});

describe('extractCardFx', () => {
  it('reads the card wording, which differs from the account export\'s "ZUM KURS VON"', () => {
    expect(extractCardFx('USD 29.00 Kurs 0.9372 vom 20.01.2023 CHF 27.18')).toEqual({ amountFx: { amount: 2900, currency: 'USD' }, fxRate: 0.9372 });
    expect(extractCardFx('Digitec Galaxus (Online) Zurich CHE')).toEqual({});
  });
});
