import { describe, expect, it } from 'vitest';

import { InvoiceModel } from '@bk2/shared-models';

import { getInvoiceExportData, getInvoiceIndex, newInvoice } from './invoice.util';

describe('invoice.util', () => {
  describe('newInvoice', () => {
    it('creates a model with the given tenantId', () => {
      const inv = newInvoice('scs');
      expect(inv.tenants).toContain('scs');
      expect(inv.isArchived).toBe(false);
    });

    it('creates an InvoiceModel instance', () => {
      const inv = newInvoice('scs');
      expect(inv).toBeInstanceOf(InvoiceModel);
    });
  });

  describe('getInvoiceIndex', () => {
    it('includes invoiceId', () => {
      const inv = newInvoice('scs');
      inv.invoiceId = 'RE-2025-001';
      expect(getInvoiceIndex(inv)).toContain('i:RE-2025-001');
    });

    it('includes amount when totalAmount is set', () => {
      const inv = newInvoice('scs');
      inv.totalAmount = { amount: 10000, currency: 'CHF', periodicity: 'one-time' };
      expect(getInvoiceIndex(inv)).toContain('a:100.00');
    });

    it('includes receiver label when receiver is set', () => {
      const inv = newInvoice('scs');
      inv.receiver = { key: 'abc', name1: 'Max', name2: 'Muster', modelType: 'person', type: '', subType: '', label: 'Max Muster' };
      expect(getInvoiceIndex(inv)).toContain('n:Max Muster');
    });

    it('includes title', () => {
      const inv = newInvoice('scs');
      inv.title = 'Jahresbeitrag 2025';
      expect(getInvoiceIndex(inv)).toContain('t:Jahresbeitrag 2025');
    });
  });

  describe('getInvoiceExportData', () => {
    it('returns header row as first element', () => {
      const data = getInvoiceExportData([]);
      expect(data[0]).toContain('invoiceId');
      expect(data[0]).toContain('state');
    });

    it('returns one data row per invoice', () => {
      const inv = newInvoice('scs');
      inv.invoiceId = 'RE-001';
      const data = getInvoiceExportData([inv]);
      expect(data).toHaveLength(2);
      expect(data[1]).toContain('RE-001');
    });
  });
});
