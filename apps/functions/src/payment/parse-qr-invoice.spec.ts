import { describe, it, expect } from 'vitest';
import { parseQrContent } from './parse-qr-invoice';

const lines = (overrides: Record<number, string>): string => {
  const l = Array.from({ length: 31 }, () => '');
  Object.assign(l, { 0: 'SPC', 1: '0200', 2: '1', 3: 'CH4431999123000889012', 4: 'S', 5: 'iWay AG',
    10: 'CH', 18: '39.00', 19: 'CHF', 27: 'QRR', 28: '210000000003139471430009017', 29: 'DSL 09', 30: 'EPD' }, overrides);
  return l.join('\r\n');
};

describe('parseQrContent', () => {
  it('reads reference and message from the right lines', () => {
    expect(parseQrContent(lines({}))).toEqual({
      iban: 'CH4431999123000889012', amount: 3900, currency: 'CHF',
      reference: '210000000003139471430009017', creditorName: 'iWay AG', message: 'DSL 09', dueDate: '',
    });
  });
  it('returns amount 0 for an open amount', () => {
    expect(parseQrContent(lines({ 18: '' })).amount).toBe(0);
  });
  it('drops the reference of type NON', () => {
    expect(parseQrContent(lines({ 27: 'NON', 28: '' })).reference).toBe('');
  });
  it('throws on text that is not a QR-bill', () => {
    expect(() => parseQrContent('hello')).toThrow();
  });
});
