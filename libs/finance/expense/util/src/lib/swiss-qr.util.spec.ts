import { describe, expect, it } from 'vitest';

import { buildSwissPaymentCode, isQrIban, renderSwissQrSvg, svgToDataUrl, SwissQrPayment, swissQrBlocker } from './swiss-qr.util';

const payment = (over: Partial<SwissQrPayment> = {}): SwissQrPayment => ({
  iban: 'CH93 0076 2011 6238 5295 7',
  creditor: { name: 'Anna Muster', street: 'Seestrasse', buildingNumber: '12', zip: '8800', city: 'Thalwil', country: 'CH' },
  amount: 322.2,
  currency: 'CHF',
  message: 'Spesen: Bootsbenzin',
  ...over,
});

describe('isQrIban', () => {
  it('detects the QR-IID range 30000–31999', () => {
    expect(isQrIban('CH44 3199 9123 0008 8901 2')).toBe(true);
    expect(isQrIban('CH93 0076 2011 6238 5295 7')).toBe(false);
  });
});

describe('swissQrBlocker', () => {
  it('accepts a complete Swiss reimbursement', () => {
    expect(swissQrBlocker(payment())).toBe('');
  });
  it('refuses a foreign IBAN and a QR-IBAN', () => {
    expect(swissQrBlocker(payment({ iban: 'DE89370400440532013000' }))).toBe('iban');
    expect(swissQrBlocker(payment({ iban: 'CH4431999123000889012' }))).toBe('iban');
  });
  it('refuses a currency the QR-bill does not know', () => {
    expect(swissQrBlocker(payment({ currency: 'USD' }))).toBe('currency');
  });
  it('refuses a creditor without town or postal code', () => {
    expect(swissQrBlocker(payment({ creditor: { ...payment().creditor, city: '' } }))).toBe('creditor');
    expect(swissQrBlocker(payment({ creditor: { ...payment().creditor, zip: ' ' } }))).toBe('creditor');
  });
});

describe('buildSwissPaymentCode', () => {
  it('writes the 31 SPC 0200 lines with a structured address and no reference', () => {
    const lines = buildSwissPaymentCode(payment()).split('\r\n');
    expect(lines).toHaveLength(31);
    expect(lines.slice(0, 11)).toEqual([
      'SPC', '0200', '1', 'CH9300762011623852957', 'S', 'Anna Muster', 'Seestrasse', '12', '8800', 'Thalwil', 'CH',
    ]);
    expect(lines.slice(11, 18)).toEqual(['', '', '', '', '', '', '']);
    expect(lines[18]).toBe('322.20');
    expect(lines[19]).toBe('CHF');
    expect(lines.slice(20, 27)).toEqual(['', '', '', '', '', '', '']);
    expect(lines.slice(27)).toEqual(['NON', '', 'Spesen: Bootsbenzin', 'EPD']);
  });
  it('leaves the amount open for 0', () => {
    expect(buildSwissPaymentCode(payment({ amount: 0 })).split('\r\n')[18]).toBe('');
  });
  it('keeps line breaks out of free text and cuts it to the field length', () => {
    const lines = buildSwissPaymentCode(payment({ message: 'a\nb' + 'x'.repeat(200) })).split('\r\n');
    expect(lines).toHaveLength(31);
    expect(lines[29].startsWith('a b')).toBe(true);
    expect(lines[29]).toHaveLength(140);
  });
  it('throws when a blocker applies', () => {
    expect(() => buildSwissPaymentCode(payment({ currency: 'USD' }))).toThrow();
  });
});

describe('renderSwissQrSvg', () => {
  it('renders an svg with the swiss cross on top', () => {
    const svg = renderSwissQrSvg(buildSwissPaymentCode(payment()));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect((svg.match(/<rect /g) ?? []).length).toBe(5);   // background + 4 cross rects
    expect(svgToDataUrl(svg).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
  });
});
