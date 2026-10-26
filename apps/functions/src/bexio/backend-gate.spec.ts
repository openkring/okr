import { describe, expect, it } from 'vitest';
import { invoiceBooksId, isBexioBackend } from './backend-gate';

describe('invoiceBooksId', () => {
  it('returns the invoice’s own books', () => {
    expect(invoiceBooksId({ accountingTenantId: 'gss', tenants: ['scs'] })).toBe('gss');
  });
  it('never falls back to the app tenant', () => {
    expect(invoiceBooksId({ tenants: ['scs'] })).toBe('');
    expect(invoiceBooksId({ accountingTenantId: '', tenants: ['scs'] })).toBe('');
  });
  it('is empty for a missing invoice or a non-string value', () => {
    expect(invoiceBooksId(undefined)).toBe('');
    expect(invoiceBooksId({ accountingTenantId: 42 })).toBe('');
  });
});

describe('isBexioBackend', () => {
  it('is true only for bexio', () => {
    expect(isBexioBackend({ accountingBackend: 'bexio' })).toBe(true);
    expect(isBexioBackend({ accountingBackend: 'native' })).toBe(false);
    expect(isBexioBackend({ accountingBackend: 'datev' })).toBe(false);
  });
  it('treats a missing config or field as native', () => {
    expect(isBexioBackend(undefined)).toBe(false);
    expect(isBexioBackend({})).toBe(false);
  });
});
