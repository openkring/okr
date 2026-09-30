import { describe, expect, it } from 'vitest';
import { voucherKind } from './voucher.util';

describe('voucherKind', () => {
  it('distinguishes images, PDFs and other files', () => {
    expect(voucherKind('image/jpeg')).toBe('image');
    expect(voucherKind('IMAGE/PNG')).toBe('image');
    expect(voucherKind('application/pdf')).toBe('pdf');
    expect(voucherKind('application/vnd.ms-excel')).toBe('file');
    expect(voucherKind('')).toBe('file');
  });
  it('treats HEIC as a file — browsers cannot render it inline', () => {
    expect(voucherKind('image/heic')).toBe('file');
  });
});
