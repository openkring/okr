import { describe, it, expect } from 'vitest';
import { pickVatCodeKey, qrFieldsOf } from './bill-scan.util';

const QR = ['SPC', '0200', '1', 'CH4431999123000889012', 'S', 'iWay AG', '', '', '', '', 'CH',
  '', '', '', '', '', '', '', '39.00', 'CHF', '', '', '', '', '', '', '',
  'QRR', '210000000003139471430009017', 'DSL 09', 'EPD'].join('\r\n');

describe('qrFieldsOf', () => {
  it('maps a QR-bill', () => {
    expect(qrFieldsOf(QR)).toEqual({ qrAmount: 3900, qrCurrency: 'CHF', qrIban: 'CH4431999123000889012',
      qrReference: '210000000003139471430009017', qrCreditorName: 'iWay AG', qrMessage: 'DSL 09' });
  });
  it('marks an open amount with -1', () => {
    expect(qrFieldsOf(QR.replace('39.00', '')).qrAmount).toBe(-1);
  });
  it('returns the empty set for no QR-bill', () => {
    expect(qrFieldsOf('')).toEqual({ qrAmount: -1, qrCurrency: '', qrIban: '', qrReference: '', qrCreditorName: '', qrMessage: '' });
  });
});

describe('pickVatCodeKey', () => {
  const codes = [
    { okey: 'v81in', rate: 8.1, direction: 'input', validFrom: '20240101', validTo: '' },
    { okey: 'v81out', rate: 8.1, direction: 'output', validFrom: '20240101', validTo: '' },
    { okey: 'v77in', rate: 7.7, direction: 'input', validFrom: '20180101', validTo: '20231231' },
  ];
  it('prefers the rule VAT code when it exists', () => {
    expect(pickVatCodeKey('v77in', [{ rate: 8.1 }], codes, '20261008')).toBe('v77in');
  });
  it('takes the valid input code of the single rate', () => {
    expect(pickVatCodeKey('', [{ rate: 8.1 }], codes, '20261008')).toBe('v81in');
  });
  it('gives up on several rates', () => {
    expect(pickVatCodeKey('', [{ rate: 8.1 }, { rate: 2.6 }], codes, '20261008')).toBe('');
  });
  it('gives up on an unknown rule code and no rate', () => {
    expect(pickVatCodeKey('nope', [], codes, '20261008')).toBe('');
  });
});
