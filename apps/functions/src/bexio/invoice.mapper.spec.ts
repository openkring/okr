import { describe, expect, it } from 'vitest';
import { invoiceSyncFields, mapInvoiceStatus } from './invoice.mapper';

describe('mapInvoiceStatus', () => {
  it('maps partial and unpaid like the migration', () => {
    expect([7, 8, 9, 16, 19, 31].map(mapInvoiceStatus)).toEqual(['draft', 'pending', 'paid', 'partial', 'cancelled', 'unpaid']);
  });
});

describe('invoiceSyncFields', () => {
  it('only sets paymentDate when bexio yields one', () => {
    expect(invoiceSyncFields(9, '20260702')).toEqual({ state: 'paid', paymentDate: '20260702' });
    expect(invoiceSyncFields(16, '')).toEqual({ state: 'partial' });
  });
});
