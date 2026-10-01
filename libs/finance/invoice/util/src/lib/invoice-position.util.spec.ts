import { describe, expect, it } from 'vitest';

import { AccountModel, InvoiceModel, InvoicePositionModel } from '@okr/shared-models';

import { INVOICE_I18N_KEYS, InvoiceI18n, invoiceRefusalText } from './invoice-i18n';
import {
  accountClass, invoiceRefusalReasons, invoicesForList, isDraftInvoice, positionsTotal, revenueAccounts,
  toInvoiceHeaderInput, toPositionInputs,
} from './invoice-position.util';
import { invoicePositionsValidations } from './invoice-position.validations';
import { newDraftInvoice } from './invoice.util';
import { INVOICE_NOTES_LENGTH, invoiceValidations } from './invoice.validations';

function account(okey: string, id: string, parentKey = ''): AccountModel {
  const a = new AccountModel('scs');
  a.okey = okey;
  a.id = id;
  a.parentKey = parentKey;
  return a;
}

describe('accountClass', () => {
  it('takes the first digit after leading zeros', () => {
    expect(accountClass('3000')).toBe(3);
    expect(accountClass('04200')).toBe(4);
    expect(accountClass('')).toBe(0);
    expect(accountClass('abc')).toBe(0);
  });
});

describe('revenueAccounts', () => {
  it('keeps only leaves of the classes 3 and 4', () => {
    const accounts = [
      account('r3', '3'), account('a3000', '3000', 'r3'), account('a4000', '4000'),
      account('a1100', '1100'), account('a6000', '6000'), account('a03100', '03100'),
    ];
    expect(revenueAccounts(accounts).map((a) => a.okey)).toEqual(['a3000', 'a4000', 'a03100']);
  });
});

describe('positionsTotal', () => {
  it('adds up in Rappen without float drift', () => {
    expect(positionsTotal([{ name: 'a', amount: 0.1, accountKey: 'x' }, { name: 'b', amount: 0.2, accountKey: 'x' }])).toBe(0.3);
    expect(positionsTotal([])).toBe(0);
    expect(positionsTotal([{ name: 'a', amount: Number.NaN, accountKey: 'x' }])).toBe(0);
  });
});

describe('toPositionInputs', () => {
  it('maps stored positions and coalesces missing fields', () => {
    const p = new InvoicePositionModel('scs');
    p.name = 'Beitrag';
    p.amount = 120.5;
    p.accountKey = 'k';
    const legacy = { ...new InvoicePositionModel('scs'), accountKey: undefined } as unknown as InvoicePositionModel;
    expect(toPositionInputs([p, legacy])).toEqual([
      { name: 'Beitrag', amount: 120.5, accountKey: 'k', description: '' },
      { name: '', amount: 0, accountKey: '', description: '' },
    ]);
  });
});

describe('toInvoiceHeaderInput', () => {
  it('sends only the header fields writeInvoice accepts', () => {
    const inv = new InvoiceModel('scs');
    inv.title = 'T';
    inv.invoiceDate = '20261001';
    inv.dueDate = '20261031';
    inv.notes = 'n';
    expect(toInvoiceHeaderInput(inv)).toEqual({ title: 'T', invoiceDate: '20261001', dueDate: '20261031', receiver: inv.receiver, notes: 'n' });
  });
});

describe('invoicesForList', () => {
  const inv = (state: string, key = 'p1') => ({ state, receiver: { key } }) as unknown as InvoiceModel;
  const all = [inv('draft'), inv('issuing'), inv('pending'), inv('paid'), inv('cancelled'), inv('pending', 'p2')];
  it('keeps the treasurer list unfiltered', () => {
    expect(invoicesForList(all, 'all', 'p1')).toEqual(all);
  });
  it('shows the receiver only issued invoices of their own', () => {
    expect(invoicesForList(all, 'my', 'p1').map((i) => i.state)).toEqual(['pending', 'paid', 'cancelled']);
    expect(invoicesForList(all, 'p2', 'p1').map((i) => i.receiver?.key)).toEqual(['p2']);
  });
  it('shows nothing in my list without a person key', () => {
    expect(invoicesForList(all, 'my', undefined)).toEqual([]);
  });
});

describe('isDraftInvoice', () => {
  it('is true only for draft', () => {
    expect(isDraftInvoice({ state: 'draft' })).toBe(true);
    expect(isDraftInvoice({ state: 'issuing' })).toBe(false);
    expect(isDraftInvoice({ state: 'pending' })).toBe(false);
    expect(isDraftInvoice(undefined)).toBe(false);
  });
});

describe('invoiceRefusalReasons', () => {
  it('reads the blockers of issue-blocked', () => {
    expect(invoiceRefusalReasons({ details: { reason: 'issue-blocked', reasons: ['no-positions', 'no-receiver'] } }))
      .toEqual(['no-positions', 'no-receiver']);
  });
  it('reads a single reason', () => {
    expect(invoiceRefusalReasons({ details: { reason: 'period-locked', periodKey: 'p' } })).toEqual(['period-locked']);
  });
  it('maps not-found and too-many-positions', () => {
    expect(invoiceRefusalReasons({ code: 'functions/not-found', message: 'x' })).toEqual(['not-found']);
    expect(invoiceRefusalReasons({ code: 'functions/invalid-argument', message: 'too-many-positions' })).toEqual(['too-many-positions']);
  });
  it('returns [] for anything else', () => {
    expect(invoiceRefusalReasons(new Error('network'))).toEqual([]);
    expect(invoiceRefusalReasons(undefined)).toEqual([]);
  });
});

describe('invoiceRefusalText', () => {
  const i18n = Object.fromEntries(Object.keys(INVOICE_I18N_KEYS).map((k) => [k, () => k])) as unknown as InvoiceI18n;
  it('joins the texts of known reasons, once each', () => {
    expect(invoiceRefusalText(['no-positions', 'no-receiver', 'no-positions'], i18n, 'generic'))
      .toBe('refusal_no_positions refusal_no_receiver');
  });
  it('gives inconsistent-state its own text', () => {
    expect(invoiceRefusalText(['inconsistent-state'], i18n, 'generic')).toBe('refusal_inconsistent_state');
  });
  it('gives the due-date blockers their own texts', () => {
    expect(invoiceRefusalText(['no-due-date'], i18n, 'generic')).toBe('refusal_no_due_date');
    expect(invoiceRefusalText(['due-before-invoice-date'], i18n, 'generic')).toBe('refusal_due_before_invoice_date');
  });
  it('maps not-issuable like not-a-draft', () => {
    expect(invoiceRefusalText(['not-issuable'], i18n, 'generic')).toBe('refusal_not_a_draft');
  });
  it('falls back for unknown reasons', () => {
    expect(invoiceRefusalText(['some-new-reason'], i18n, 'generic')).toBe('generic');
    expect(invoiceRefusalText([], i18n, 'generic')).toBe('generic');
  });
});

describe('invoicePositionsValidations', () => {
  it('needs at least one position', () => {
    const r = invoicePositionsValidations([]);
    expect(r.isValid()).toBe(false);
    expect(r.getErrors('positions').length).toBe(1);
  });
  it('accepts a complete position', () => {
    expect(invoicePositionsValidations([{ name: 'Beitrag', amount: 100, accountKey: 'k' }]).isValid()).toBe(true);
  });
  it('files row errors under index.field', () => {
    const r = invoicePositionsValidations([{ name: 'ok', amount: 1, accountKey: 'k' }, { name: ' ', amount: 0, accountKey: '' }]);
    expect(r.isValid()).toBe(false);
    expect(r.getErrors('0.name')).toEqual([]);
    expect(r.getErrors('1.name').length).toBe(1);
    expect(r.getErrors('1.amount').length).toBe(1);
    expect(r.getErrors('1.accountKey').length).toBe(1);
  });
  it('rejects an amount that rounds to zero Rappen or is negative', () => {
    expect(invoicePositionsValidations([{ name: 'a', amount: 0.004, accountKey: 'k' }]).isValid()).toBe(false);
    expect(invoicePositionsValidations([{ name: 'a', amount: -5, accountKey: 'k' }]).isValid()).toBe(false);
  });
});

describe('newDraftInvoice', () => {
  it('is a dated draft of the given books without receiver', () => {
    const inv = newDraftInvoice('scs', 'scs', '20261001');
    expect(inv.state).toBe('draft');
    expect(inv.accountingTenantId).toBe('scs');
    expect(inv.invoiceDate).toBe('20261001');
    expect(inv.dueDate).toBe('20261031');
    expect(inv.receiver).toBeUndefined();
  });
});

describe('invoiceValidations notes', () => {
  it('caps the notes at the server limit', () => {
    const inv = newDraftInvoice('scs', 'scs', '20261001');
    inv.notes = 'x'.repeat(INVOICE_NOTES_LENGTH);
    expect(invoiceValidations(inv, '', '').getErrors('notes')).toEqual([]);
    inv.notes = 'x'.repeat(INVOICE_NOTES_LENGTH + 1);
    expect(invoiceValidations(inv, '', '').getErrors('notes').length).toBe(1);
  });
});
