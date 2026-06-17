import { describe, it, expect } from 'vitest';
import { parseSwissAmount, pickFavoriteByChannel, buildQrSlipData, QrPayee } from './qr-slip.util';
import { AddressModel } from '@bk2/shared-models';

describe('parseSwissAmount', () => {
  it('parses a Swiss-formatted string with apostrophe', () => {
    expect(parseSwissAmount("1'000.00")).toBe(1000);
  });
  it('parses a curly apostrophe', () => {
    expect(parseSwissAmount('1’500.50')).toBe(1500.5);
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
  name: 'Gönnerverein', iban: 'CH64 8080 8003 3249 8735 9',
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
