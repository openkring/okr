import { describe, expect, it } from 'vitest';

import { isSwissQrBill, parseSwissQrBill, stripQrBillDebtor } from './swiss-qr-bill.util';

// The layout of a real invoice (4row GmbH, QR-IBAN with QR reference), debtor filled in.
const LINES = [
  'SPC', '0200', '1', 'CH3130000001852196280',
  'S', '4row GmbH', 'Kronenwis', '19', '8864', 'Reichenburg', 'CH',
  '', '', '', '', '', '', '',
  '36.50', 'CHF',
  'S', 'Anna Muster', 'Seestrasse', '12', '8712', 'Stäfa', 'CH',
  'QRR', '210000000003139471430009017', 'Invoice 202625811', 'EPD',
];
const PAYLOAD = LINES.join('\n');

describe('isSwissQrBill', () => {
  it('recognises a Swiss Payment Code with LF or CRLF separators', () => {
    expect(isSwissQrBill(PAYLOAD)).toBe(true);
    expect(isSwissQrBill(LINES.join('\r\n'))).toBe(true);
  });
  it('rejects other QR contents', () => {
    expect(isSwissQrBill('https://example.com/receipt/123')).toBe(false);
    expect(isSwissQrBill('')).toBe(false);
    expect(isSwissQrBill(undefined)).toBe(false);
    expect(isSwissQrBill(LINES.slice(0, 20).join('\n'))).toBe(false);   // truncated, no EPD
  });
});

describe('parseSwissQrBill', () => {
  it('reads creditor, amount and reference of a structured address', () => {
    expect(parseSwissQrBill(PAYLOAD)).toEqual({
      iban: 'CH3130000001852196280',
      creditorName: '4row GmbH',
      creditorStreet: 'Kronenwis 19',
      creditorPlace: '8864 Reichenburg',
      creditorCountry: 'CH',
      amount: '36.50',
      currency: 'CHF',
      referenceType: 'QRR',
      reference: '210000000003139471430009017',
      message: 'Invoice 202625811',
    });
  });
  it('reads the two address lines of a combined (K) address', () => {
    const k = [...LINES];
    k.splice(4, 7, 'K', 'Verein X', 'Hauptstrasse 1', '8000 Zürich', '', '', 'CH');
    const bill = parseSwissQrBill(k.join('\n'));
    expect(bill?.creditorStreet).toBe('Hauptstrasse 1');
    expect(bill?.creditorPlace).toBe('8000 Zürich');
  });
  it('returns undefined for anything else', () => {
    expect(parseSwissQrBill('hello')).toBeUndefined();
  });
});

describe('stripQrBillDebtor', () => {
  it('blanks exactly the seven debtor lines and keeps everything else', () => {
    const stripped = stripQrBillDebtor(PAYLOAD).split('\r\n');
    expect(stripped).toHaveLength(LINES.length);
    expect(stripped.slice(20, 27)).toEqual(['', '', '', '', '', '', '']);
    expect(stripped.slice(0, 20)).toEqual(LINES.slice(0, 20));
    expect(stripped.slice(27)).toEqual(LINES.slice(27));
    expect(stripQrBillDebtor(PAYLOAD)).not.toContain('Anna');
  });
  it('still parses after stripping', () => {
    expect(parseSwissQrBill(stripQrBillDebtor(PAYLOAD))?.iban).toBe('CH3130000001852196280');
  });
});
