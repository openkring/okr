import { describe, expect, it } from 'vitest';
import { ADD_ON_BLOCKS, ADD_ON_PRICES } from '@okr/business-metering-util';

import { COLLECTION_I18N_KEYS } from './collection-i18n';
import {
  aboStateKey, BillingOverviewRow, boardFlags, filterBoardRows, invoiceStateKind, isInvoicePayable, isOptionAvailable,
  MyBillingInvoice, nextInvoiceEstimate, optionI18nKey, optionRows,
} from './subscription.util';

describe('aboStateKey', () => {
  it('an exempt tenant has a contract, whatever its state', () => {
    expect(aboStateKey({ billing: 'exempt', state: 'pastDue' })).toBe('exempt');
  });
  it('a doc without billing counts as exempt (the model default)', () => expect(aboStateKey({})).toBe('exempt'));
  it('maps each Stripe state to itself', () => {
    for (const state of ['active', 'pastDue', 'closing', 'closed', 'cancelled'] as const) {
      expect(aboStateKey({ billing: 'stripe', state })).toBe(state);
    }
  });
  it('a Stripe doc without state reads as active (reads skip defaults)', () => {
    expect(aboStateKey({ billing: 'stripe' })).toBe('active');
  });
  it('an unknown state reads as active', () => {
    expect(aboStateKey({ billing: 'stripe', state: 'weird' as never })).toBe('active');
  });
  it('every key has a state text', () => {
    for (const key of ['exempt', 'active', 'pastDue', 'closing', 'closed', 'cancelled'] as const) {
      expect(COLLECTION_I18N_KEYS[`abo_state_${key}`]).toBeDefined();
    }
  });
});

describe('nextInvoiceEstimate', () => {
  it('is the band price plus the subscribed options, in Rappen', () => {
    expect(nextInvoiceEstimate('KringS', ['buchhaltung', 'logbuch'])).toEqual({ kind: 'amount', amount: (15 + 20 + 5) * 100 });
  });
  it('is the band price alone without options', () => expect(nextInvoiceEstimate('KringXXS', [])).toEqual({ kind: 'amount', amount: 900 }));
  it('counts a duplicated option once and an unknown option as 0', () => {
    expect(nextInvoiceEstimate('KringXS', ['crm', 'crm', 'unknown'])).toEqual({ kind: 'amount', amount: 2200 });
  });
  it('is unmeasured without a band', () => {
    expect(nextInvoiceEstimate('', ['crm'])).toEqual({ kind: 'unmeasured', amount: 0 });
    expect(nextInvoiceEstimate(undefined, undefined)).toEqual({ kind: 'unmeasured', amount: 0 });
  });
  it('is individual from 1000 weighted users (the run refuses those bands)', () => {
    expect(nextInvoiceEstimate('KringXXL', [])).toEqual({ kind: 'individual', amount: 0 });
    expect(nextInvoiceEstimate('KringXXXL', [])).toEqual({ kind: 'individual', amount: 0 });
    expect(nextInvoiceEstimate('KringXL', []).kind).toBe('amount');
  });
});

describe('option availability', () => {
  it('an option with blocks is available', () => expect(isOptionAvailable('buchhaltung')).toBe(true));
  it('an option mapped to no block is «bald verfügbar»', () => {
    expect(isOptionAvailable('shop')).toBe(false);
    expect(isOptionAvailable('lohnbuchhaltung')).toBe(false);
  });
  it('an unknown option is not available', () => expect(isOptionAvailable('nope')).toBe(false));

  it('lists every priced option once, with price, availability and subscription', () => {
    const rows = optionRows(['crm', 'shop']);
    expect(rows.map(r => r.id)).toEqual(Object.keys(ADD_ON_PRICES));
    expect(rows.find(r => r.id === 'crm')).toEqual({ id: 'crm', price: 10, available: true, subscribed: true });
    expect(rows.find(r => r.id === 'shop')).toEqual({ id: 'shop', price: 5, available: false, subscribed: true });
    expect(rows.find(r => r.id === 'anlagen')?.subscribed).toBe(false);
  });
  it('coalesces missing options', () => expect(optionRows(undefined).every(r => !r.subscribed)).toBe(true));

  it('every option has a German name key', () => {
    for (const id of Object.keys(ADD_ON_BLOCKS)) {
      expect(COLLECTION_I18N_KEYS[optionI18nKey(id)!]).toBeDefined();
    }
  });
  it('an unknown option has no name key', () => expect(optionI18nKey('nope')).toBeUndefined());
});

const inv = (p: Partial<MyBillingInvoice>): MyBillingInvoice => ({
  invoiceKey: 'k', invoiceNo: 1, invoiceDate: '20261101', dueDate: '20261130', totalAmount: 3500, openAmount: 3500,
  state: 'pending', billingKind: 'subscription', title: '', ...p,
});

describe('invoices', () => {
  const today = '20261110';
  it('open before the due date', () => expect(invoiceStateKind(inv({}), today)).toBe('open'));
  it('overdue after the due date', () => expect(invoiceStateKind(inv({ dueDate: '20261109' }), today)).toBe('overdue'));
  it('partially paid', () => expect(invoiceStateKind(inv({ state: 'partial', openAmount: 1000 }), today)).toBe('partial'));
  it('paid when nothing is open', () => expect(invoiceStateKind(inv({ state: 'paid', openAmount: 0 }), today)).toBe('paid'));
  it('cancelled wins', () => expect(invoiceStateKind(inv({ state: 'cancelled' }), today)).toBe('cancelled'));
  it('payable only with an open amount and not cancelled', () => {
    expect(isInvoicePayable(inv({}))).toBe(true);
    expect(isInvoicePayable(inv({ openAmount: 0 }))).toBe(false);
    expect(isInvoicePayable(inv({ state: 'cancelled' }))).toBe(false);
  });
});

const row = (p: Partial<BillingOverviewRow>): BillingOverviewRow => ({
  tenantId: 't', name: 'T', billing: 'stripe', state: 'active', band: 'KringS', options: [], autopay: false,
  lastInvoice: null, openAmount: 0, failedAttempts: 0, creditBalance: 0, excludedUsers: 0, flags: [], ...p,
});

describe('board filters', () => {
  const rows = [
    row({ tenantId: 'a', state: 'active' }),
    row({ tenantId: 'b', state: 'pastDue', flags: ['run-failed'] }),
    row({ tenantId: 'c', state: 'active', flags: ['overpaid', 'run-failed'] }),
    row({ tenantId: 'd', billing: 'exempt' }),
  ];
  it('all/all keeps every row', () => expect(filterBoardRows(rows, 'all', 'all')).toHaveLength(4));
  it('filters by state', () => expect(filterBoardRows(rows, 'pastDue', 'all').map(r => r.tenantId)).toEqual(['b']));
  it('filters by flag', () => expect(filterBoardRows(rows, 'all', 'run-failed').map(r => r.tenantId)).toEqual(['b', 'c']));
  it('combines both', () => expect(filterBoardRows(rows, 'active', 'run-failed').map(r => r.tenantId)).toEqual(['c']));
  it('the exempt filter picks contract tenants', () => expect(filterBoardRows(rows, 'exempt', 'all').map(r => r.tenantId)).toEqual(['d']));
  it('lists the flags present, sorted, once', () => expect(boardFlags(rows)).toEqual(['overpaid', 'run-failed']));
});
