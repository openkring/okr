import { describe, it, expect } from 'vitest';
import { parseSwissAmount, pickFavoriteByChannel, buildQrSlipData, pickBankIbans, QrPayee, selectSlipAccount, SlipAccountError } from './qr-slip.util';
import { AddressModel } from '@okr/shared-models';

describe('parseSwissAmount', () => {
  it('parses a Swiss-formatted string with apostrophe', () => {
    expect(parseSwissAmount("1'000.00")).toBe(1000);
  });
  it('parses both curly apostrophes', () => {
    expect(parseSwissAmount('1’500.50')).toBe(1500.5); // U+2019 right
    expect(parseSwissAmount('1‘500.50')).toBe(1500.5); // U+2018 left
  });
  it('parses a plain decimal', () => {
    expect(parseSwissAmount('250.50')).toBe(250.5);
  });
  it('accepts a number', () => {
    expect(parseSwissAmount(42)).toBe(42);
  });
  it('returns undefined for empty/invalid', () => {
    expect(parseSwissAmount('')).toBeUndefined();
    expect(parseSwissAmount('abc')).toBeUndefined();
    expect(parseSwissAmount(undefined)).toBeUndefined();
  });
});

const addr = (over: Partial<AddressModel>): AddressModel =>
  ({ ...new AddressModel('t1'), ...over });

describe('pickFavoriteByChannel', () => {
  it('prefers the favorite address of the channel', () => {
    const list = [
      addr({ addressChannel: 'bankaccount', iban: 'A', isFavorite: false }),
      addr({ addressChannel: 'bankaccount', iban: 'B', isFavorite: true }),
    ];
    expect(pickFavoriteByChannel(list, 'bankaccount')?.iban).toBe('B');
  });
  it('falls back to the first matching when none is favorite', () => {
    const list = [addr({ addressChannel: 'bankaccount', iban: 'A' })];
    expect(pickFavoriteByChannel(list, 'bankaccount')?.iban).toBe('A');
  });
  it('skips archived and returns undefined when none match', () => {
    const list = [addr({ addressChannel: 'postal', isArchived: true })];
    expect(pickFavoriteByChannel(list, 'postal')).toBeUndefined();
    expect(pickFavoriteByChannel(list, 'bankaccount')).toBeUndefined();
  });
});

const payee: QrPayee = {
  name: 'Gönnerverein', iban: 'CH64 8080 8003 3249 8735 9', qrIban: '', regularIban: 'CH64 8080 8003 3249 8735 9',
  street: 'Seestrasse', buildingNumber: '1', zip: '8712', city: 'Stäfa', country: 'CH',
};
const payload = {
  firstName: 'Anna', lastName: 'Muster', streetName: 'Dorfweg', streetNumber: '5',
  zipCode: '8000', city: 'Zürich', countryCode: 'CH', amount: "1'000.00",
};

describe('buildQrSlipData', () => {
  it('builds creditor with a space-stripped IBAN', () => {
    const d = buildQrSlipData(payee, payload, false);
    expect(d.creditor.account).toBe('CH6480808003324987359');
    expect(d.currency).toBe('CHF');
  });
  it('maps the debtor from payload', () => {
    const d = buildQrSlipData(payee, payload, false);
    expect(d.debtor?.name).toBe('Anna Muster');
    expect(d.debtor?.zip).toBe('8000');
  });
  it('omits amount when withAmount is false', () => {
    expect(buildQrSlipData(payee, payload, false).amount).toBeUndefined();
  });
  it('includes parsed amount when withAmount is true', () => {
    expect(buildQrSlipData(payee, payload, true).amount).toBe(1000);
  });
  it('omits the debtor when payload lacks name/city/zip', () => {
    expect(buildQrSlipData(payee, {}, false).debtor).toBeUndefined();
  });
});

describe('buildQrSlipData message', () => {
  const msgPayee: QrPayee = { name: 'SCS', iban: 'CH93 0076 2011 6238 5295 7', qrIban: '', regularIban: 'CH93 0076 2011 6238 5295 7', street: 'Seestrasse', buildingNumber: '1', zip: '8712', city: 'Stäfa', country: 'CH' };
  it('carries payload.qrMessage as the unstructured message', () => {
    expect(buildQrSlipData(msgPayee, { qrMessage: 'Rechnung 202600001' }, false).message).toBe('Rechnung 202600001');
  });
  it('omits an empty message and caps it at 140 characters', () => {
    expect(buildQrSlipData(msgPayee, {}, false)).not.toHaveProperty('message');
    expect(buildQrSlipData(msgPayee, { qrMessage: 'x'.repeat(200) }, false).message).toHaveLength(140);
  });
});

const QR = 'CH4431999123000889012';
const REG = 'CH9300762011623852957';
const REF = '210000000003139471430009017';
const slipPayee = (qrIban: string, regularIban: string): QrPayee => ({
  name: 'SCS', iban: regularIban || qrIban, qrIban, regularIban, street: 'Seestr.', buildingNumber: '1', zip: '8000', city: 'Zürich', country: 'CH',
});
const bank = (iban: string, isFavorite = false, isArchived = false) =>
  ({ addressChannel: 'bankaccount', iban, isFavorite, isArchived }) as unknown as AddressModel;

describe('pickBankIbans', () => {
  it('classifies favorite-else-first per kind, skipping archived', () => {
    expect(pickBankIbans([bank(REG), bank(QR), bank('CH4430000000000000000', true)]))
      .toEqual({ qrIban: 'CH4430000000000000000', regularIban: REG });
    expect(pickBankIbans([bank(QR, false, true), bank(REG)])).toEqual({ qrIban: '', regularIban: REG });
  });
});

describe('selectSlipAccount', () => {
  it('reference + QR-IBAN → QRR on the QR-IBAN', () => {
    expect(selectSlipAccount(slipPayee(QR, REG), REF)).toEqual({ account: QR, reference: REF });
  });
  it('reference without QR-IBAN → regular IBAN, no reference', () => {
    expect(selectSlipAccount(slipPayee('', REG), REF)).toEqual({ account: REG });
  });
  it('no reference → regular IBAN even when a QR-IBAN exists', () => {
    expect(selectSlipAccount(slipPayee(QR, REG), '')).toEqual({ account: REG });
  });
  it('only a QR-IBAN and no reference → error', () => {
    expect(() => selectSlipAccount(slipPayee(QR, ''), '')).toThrow(SlipAccountError);
  });
  it('no IBAN at all → error', () => {
    expect(() => selectSlipAccount(slipPayee('', ''), REF)).toThrowError(/no-iban/);
  });
});

describe('buildQrSlipData with an account', () => {
  it('uses the selected account and carries the reference', () => {
    const d = buildQrSlipData(slipPayee(QR, REG), {}, false, { account: QR, reference: REF });
    expect(d.creditor.account).toBe(QR);
    expect(d.reference).toBe(REF);
  });
  it('defaults to payee.iban without reference', () => {
    const d = buildQrSlipData(slipPayee('', REG), {}, false);
    expect(d.creditor.account).toBe(REG);
    expect(d.reference).toBeUndefined();
  });
  it('QRR with a message carries both reference and message', () => {
    const d = buildQrSlipData(slipPayee(QR, REG), { qrMessage: 'Rechnung 1' }, false, { account: QR, reference: REF });
    expect(d.reference).toBe(REF);
    expect(d.message).toBe('Rechnung 1');
  });
});
