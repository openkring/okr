import { describe, expect, it } from 'vitest';
import { MAX_VOUCHER_KEYS, validVoucherKeys, voucherView } from './voucher-view';

describe('validVoucherKeys', () => {
  it('keeps distinct non-empty strings, capped', () => {
    expect(validVoucherKeys(['a', '', 'a', 'b', 7 as never])).toEqual(['a', 'b']);
    expect(validVoucherKeys(Array.from({ length: 80 }, (_, i) => `k${i}`))).toHaveLength(MAX_VOUCHER_KEYS);
    expect(validVoucherKeys(undefined)).toEqual([]);
  });
});

describe('voucherView', () => {
  const doc = { tenants: ['scs'], fullPath: 'tenant/scs/private/finance/bexio/u.pdf', title: 'Rechnung.pdf', mimeType: 'application/pdf', size: 1234 };
  it('describes a document of the caller\'s tenant', () => {
    expect(voucherView('bexio-file-1', doc, ['scs'])).toEqual({ key: 'bexio-file-1', name: 'Rechnung.pdf', mimeType: 'application/pdf', size: 1234, path: doc.fullPath });
  });
  it('drops a missing doc, a foreign tenant and a doc without a path', () => {
    expect(voucherView('x', undefined, ['scs'])).toBeNull();
    expect(voucherView('x', doc, ['gss'])).toBeNull();
    expect(voucherView('x', { ...doc, fullPath: '' }, ['scs'])).toBeNull();
  });
  it('falls back to the key when the doc has no title', () => {
    expect(voucherView('bexio-file-2', { ...doc, title: '' }, ['scs'])?.name).toBe('bexio-file-2');
  });
});

import { canThumbnail } from './voucher-view';
describe('canThumbnail', () => {
  it('lets imgix render images (HEIC included) and PDFs, nothing else', () => {
    expect(canThumbnail('application/pdf')).toBe(true);
    expect(canThumbnail('image/jpeg')).toBe(true);
    expect(canThumbnail('image/heic')).toBe(true);
    expect(canThumbnail('application/zip')).toBe(false);
    expect(canThumbnail('')).toBe(false);
  });
});
