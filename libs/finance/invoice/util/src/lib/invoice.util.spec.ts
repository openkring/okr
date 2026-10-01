import { describe, expect, it } from 'vitest';

import { InvoiceModel } from '@okr/shared-models';

import { getInvoiceExportData, getInvoiceIndex, getNextInvoiceNo, newInvoice, newMemberInvoice, withInvoiceNo } from './invoice.util';

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

  describe('getNextInvoiceNo', () => {
    it('starts a new year at year * 100000 + 1', () => {
      expect(getNextInvoiceNo([], 2026)).toBe(202600001);
    });

    it('ignores invoiceNos from other years', () => {
      expect(getNextInvoiceNo([202500042], 2026)).toBe(202600001);
    });

    it('increments the max invoiceNo of the given year', () => {
      expect(getNextInvoiceNo([202600001, 202600002, 202500099], 2026)).toBe(202600003);
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

describe('newMemberInvoice', () => {
  it('addresses the member, dates it today and sets a 30-day term', () => {
    const inv = newMemberInvoice('scs', 'scs', { memberKey: 'p1', memberName1: 'Anna', memberName2: 'Muster', memberModelType: 'person' }, '20261001');
    expect(inv.tenants).toEqual(['scs']);
    expect(inv.accountingTenantId).toBe('scs');
    expect(inv.invoiceDate).toBe('20261001');
    expect(inv.dueDate).toBe('20261031');
    expect(inv.receiver).toMatchObject({ key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', label: 'Anna Muster' });
    expect(inv.invoiceNo).toBe(0);
  });
});

describe('withInvoiceNo', () => {
  it('stamps the number and uses it as the visible Rechnungsnummer when that is empty', () => {
    const inv = withInvoiceNo(new InvoiceModel('scs'), 202600001);
    expect(inv.invoiceNo).toBe(202600001);
    expect(inv.invoiceId).toBe('202600001');
  });

  it('keeps a hand-entered Rechnungsnummer and an existing number', () => {
    const typed = { ...new InvoiceModel('scs'), invoiceId: 'R-17' };
    expect(withInvoiceNo(typed, 202600001).invoiceId).toBe('R-17');
    const numbered = { ...new InvoiceModel('scs'), invoiceNo: 202600005 };
    expect(withInvoiceNo(numbered, 202600009).invoiceNo).toBe(202600005);
  });
});
