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

import { voucherTileImage } from './voucher.util';
describe('voucherTileImage', () => {
  const v = { key: 'k', name: 'a.pdf', mimeType: 'application/pdf', size: 1, url: 'https://storage/orig', thumbnailUrl: '' };
  it('prefers the signed imgix thumbnail', () => {
    expect(voucherTileImage({ ...v, thumbnailUrl: 'https://thumb' }, 'logo')).toEqual({ imageUrl: 'https://thumb', isLogo: false });
  });
  it('falls back to the original for an inline image, else to the file logo', () => {
    expect(voucherTileImage({ ...v, mimeType: 'image/png' }, 'logo')).toEqual({ imageUrl: 'https://storage/orig', isLogo: false });
    expect(voucherTileImage(v, 'logo')).toEqual({ imageUrl: 'logo', isLogo: true });
  });
});
