import { describe, it, expect } from 'vitest';
import { isReapableBillScan } from './reap-bill-scans';

const NOW = Date.parse('2026-10-08T12:00:00Z');

describe('isReapableBillScan', () => {
  it('reaps a bill scan older than 24 h', () =>
    expect(isReapableBillScan('tenant/scs/ocr/bill/k1/r.pdf', '2026-10-07T11:00:00Z', NOW)).toBe(true));
  it('keeps a fresh bill scan', () =>
    expect(isReapableBillScan('tenant/scs/ocr/bill/k1/r.pdf', '2026-10-08T11:00:00Z', NOW)).toBe(false));
  it('never touches expense receipts, however old', () =>
    expect(isReapableBillScan('tenant/scs/ocr/expense/e1/r.pdf', '2020-01-01T00:00:00Z', NOW)).toBe(false));
  it('keeps a file without a creation time', () =>
    expect(isReapableBillScan('tenant/scs/ocr/bill/k1/r.pdf', undefined, NOW)).toBe(false));
});
