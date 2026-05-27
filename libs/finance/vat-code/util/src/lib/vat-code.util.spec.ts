import { describe, it, expect } from 'vitest';
import { VatCodeModel } from '@bk2/shared-models';
import { computeVatFromNet, computeGrossFromNet, resolveActiveVatCode } from './vat-code.util';

describe('computeVatFromNet', () => {
  it('computes VAT amount in cents from net and rate', () => {
    // net 100.00 CHF (10000 cents) at 8.1%  → 810 cents
    expect(computeVatFromNet(10000, 8.1)).toBe(810);
  });

  it('rounds to nearest cent', () => {
    // net 99.00 at 8.1% = 8.019 → 802 cents (round down)
    expect(computeVatFromNet(9900, 8.1)).toBe(802);
  });

  it('returns 0 for zero rate', () => {
    expect(computeVatFromNet(10000, 0)).toBe(0);
  });
});

describe('computeGrossFromNet', () => {
  it('adds VAT to net in cents', () => {
    expect(computeGrossFromNet(10000, 8.1)).toBe(10810);
  });
});

describe('resolveActiveVatCode', () => {
  const codes: Partial<VatCodeModel>[] = [
    { bkey: 'a', validFrom: '20230101', validTo: '20231231', code: 'UST_77' },
    { bkey: 'b', validFrom: '20240101', validTo: '', code: 'UST_81' },
  ];

  it('returns the code valid on the given date', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20240601');
    expect(result?.bkey).toBe('b');
  });

  it('returns the code valid on the given date (old period)', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20230601');
    expect(result?.bkey).toBe('a');
  });

  it('returns undefined when no code is active', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20220101');
    expect(result).toBeUndefined();
  });
});
