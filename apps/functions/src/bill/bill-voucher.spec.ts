import { describe, it, expect } from 'vitest';
import { billScanRefusal, billVoucherPath } from './bill-voucher';

describe('billScanRefusal', () => {
  const ok = { tenants: ['scs'], ocrUsage: 'bill', storagePath: 'tenant/scs/ocr/bill/k1/r.pdf', status: 'processed' };
  it('accepts a processed bill scan of the tenant', () => expect(billScanRefusal(ok, 'scs')).toBe(''));
  it('accepts a scan whose stage 2 has not finished', () => expect(billScanRefusal({ ...ok, status: 'extracted' }, 'scs')).toBe(''));
  it('accepts a failed scan (the file is still worth keeping)', () => expect(billScanRefusal({ ...ok, status: 'failed' }, 'scs')).toBe(''));
  it('refuses a missing result', () => expect(billScanRefusal(undefined, 'scs')).toBe('scan-not-found'));
  it('refuses another tenant', () => expect(billScanRefusal(ok, 'gss')).toBe('scan-not-found'));
  it('refuses an expense receipt', () => expect(billScanRefusal({ ...ok, ocrUsage: 'expense' }, 'scs')).toBe('scan-wrong-usage'));
  it('refuses a scan already attached', () => expect(billScanRefusal({ ...ok, documentKey: 'bill-x' }, 'scs')).toBe('scan-already-attached'));
});

describe('billVoucherPath', () => {
  it('keeps the file name under the bill folder', () => {
    expect(billVoucherPath('scs', 'B1', 'tenant/scs/ocr/bill/k1/rechnung.pdf')).toBe('tenant/scs/finance/bill/B1/rechnung.pdf');
  });
});
