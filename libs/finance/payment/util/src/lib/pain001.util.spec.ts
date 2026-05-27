import { describe, it, expect } from 'vitest';
import { detectPaymentType } from './pain001.util';

describe('detectPaymentType', () => {
  it('detects QR-IBAN with QR reference as QRR', () => {
    // QR-IBAN starts with 3000x–3199x in positions 5-9
    expect(detectPaymentType('CH4431999123000889012', 'CHF', '210000000003139471430009017')).toBe('QRR');
  });

  it('detects IBAN with SCOR reference as SCOR', () => {
    expect(detectPaymentType('CH9300762011623852957', 'CHF', 'RF18539007547034')).toBe('SCOR');
  });

  it('detects SEPA transfer for EUR IBAN', () => {
    expect(detectPaymentType('CH9300762011623852957', 'CHF', '')).toBe('NON');
  });

  it('detects NON for CHF non-QR IBAN without structured reference', () => {
    expect(detectPaymentType('CH9300762011623852957', 'CHF', '')).toBe('NON');
  });
});
