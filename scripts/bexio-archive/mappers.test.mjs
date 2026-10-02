import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToStoreDate, toRappen, accountOkey, mapInvoiceState, mapBillState, fileOkey, filePath,
  mapInvoicePayment, mapReminder, mapComment, mapBillPayment, staleIds, journalLineAmounts, isNativeReminder, mergeArchivedReminders, mergeArchivedPayments, hasNativeActivity, deletableStale,
} from './mappers.mjs';

test('dates and money', () => {
  assert.equal(isoToStoreDate('2026-09-28T10:11:12+02:00'), '20260928');
  assert.equal(isoToStoreDate('2026-09-28'), '20260928');
  assert.equal(isoToStoreDate(null), '');
  assert.equal(toRappen('1234.56'), 123456);
  assert.equal(toRappen(0.1 + 0.2), 30);
  assert.equal(toRappen(null), 0);
});

test('accountOkey pads the bexio id like the account sync', () => {
  assert.equal(accountOkey('scs', 256), 'scs0256');
  assert.equal(accountOkey('scs', '12345'), 'scs12345');
});

test('invoice states incl. partial and unpaid', () => {
  assert.deepEqual([7, 8, 9, 16, 19, 31].map(mapInvoiceState), ['draft', 'pending', 'paid', 'partial', 'cancelled', 'unpaid']);
  assert.equal(mapInvoiceState(99), '99');
});

test('bill states never leak a bexio status', () => {
  assert.equal(mapBillState('PAID'), 'paid');
  assert.equal(mapBillState('DRAFT'), 'draft');
  assert.equal(mapBillState('PARTIALLY_PAID', false), 'todo');
  assert.equal(mapBillState('FAILED', true), 'overdue');
  assert.equal(mapBillState('BOOKED'), 'todo');
});

test('file keys are stable and shared', () => {
  assert.equal(fileOkey(4711), 'bexio-file-4711');
  assert.equal(fileOkey('4711'), fileOkey(4711));
  assert.equal(filePath('scs', 'ab-cd', 'PDF'), 'tenant/scs/private/finance/bexio/ab-cd.pdf');
  assert.equal(filePath('scs', 'ab-cd', ''), 'tenant/scs/private/finance/bexio/ab-cd');
});

test('payments, reminders, comments', () => {
  const bank = new Map([['3', 'scs0021']]);
  assert.deepEqual(mapInvoicePayment({ date: '2026-05-01', value: '80.00', bank_account_id: 3 }, 'scs', bank),
    { date: '20260501', amount: 8000, bankAccountKey: 'scs0021', bookingKey: '' });
  assert.equal(mapInvoicePayment({ date: '2026-05-01', value: '80.00', bank_account_id: null }, 'scs', bank).bankAccountKey, '');
  assert.deepEqual(mapReminder({ reminder_level: 2, is_valid_from: '2026-06-01', is_valid_to: '2026-06-15', is_sent: true }, 'bexio-reminder-1-2'),
    { level: 2, date: '20260601', dueDate: '20260615', isSent: true, documentKey: 'bexio-reminder-1-2', fee: 0, bookingKey: '', waivedAt: '', waiveBookingKey: '' });
  const c = mapComment({ id: 9, text: 'bezahlt bar', user_name: 'Kassier', date: '2026-05-02 14:30:00' }, '2097', 'scs', []);
  assert.equal(c.okey, 'bexio-comment-9');
  assert.equal(c.parentKey, 'invoice.2097');
  assert.equal(c.description, 'bezahlt bar');
  assert.equal(c.authorKey, '');
  assert.equal(c.authorName, 'Kassier');
  assert.equal(c.creationDateTime, '20260502143000');
  assert.deepEqual(c.tenants, ['scs']);
  assert.deepEqual(mapBillPayment({ execution_date: '2026-03-03', amount: 120.5, payment_type: 'RECONCILED' }),
    { date: '20260303', amount: 12050, type: 'RECONCILED' });
});

test('staleIds lists local ids bexio no longer has', () => {
  assert.deepEqual(staleIds(['1', '2', '3'], ['1', '3', '4']), ['2']);
  assert.deepEqual(staleIds([], ['1']), []);
});

test('journalLineAmounts books a EUR row in CHF and keeps the EUR amount', () => {
  const codes = new Map([[1, 'CHF'], [2, 'EUR']]);
  assert.deepEqual(journalLineAmounts({ amount: 168.15, currency_id: 2, base_currency_id: 1, base_currency_amount: 159 }, codes), {
    chf: { amount: 15900, currency: 'CHF', periodicity: 'one-time' },
    fx: { amount: 16815, currency: 'EUR', periodicity: 'one-time' },
  });
  assert.equal(journalLineAmounts({ amount: 588.57, currency_id: 1, base_currency_id: 1, base_currency_amount: 588.57 }, codes).fx, null);
});

test('native reminders are recognised and survive a merge', () => {
  assert.equal(isNativeReminder({ documentKey: 'invoice-a-reminder-1', bookingKey: '' }), true);
  assert.equal(isNativeReminder({ documentKey: '', bookingKey: 'invoice-a-reminder-2' }), true);
  assert.equal(isNativeReminder({ documentKey: 'bexio-reminder-7-1', bookingKey: '' }), false);
  assert.equal(isNativeReminder({ documentKey: '', bookingKey: '' }), false);
  const archived = [{ level: 1, documentKey: 'bexio-reminder-7-1', bookingKey: '' }];
  assert.deepEqual(mergeArchivedReminders(undefined, archived), archived);
  const native = { level: 2, documentKey: 'invoice-7-reminder-2', bookingKey: 'invoice-7-reminder-2' };
  assert.deepEqual(mergeArchivedReminders([{ level: 1, documentKey: 'bexio-old', bookingKey: '' }, native], archived), [archived[0], native]);
  assert.deepEqual(mergeArchivedReminders([native], [{ level: 2, documentKey: 'bexio-reminder-7-2', bookingKey: '' }]), [native]);
});

test('a re-run keeps payments recorded in okr (spec 1.76 phase 2) next to the archived bexio ones', () => {
  const archived = [{ date: '20250310', amount: 5000, bankAccountKey: 'scs0077', bookingKey: '' }];
  assert.deepEqual(mergeArchivedPayments(undefined, archived), archived);
  const native = { date: '20261015', amount: 2500, bankAccountKey: 'scs0077', bookingKey: 'invoice-7-pay-Ab12Cd34Ef' };
  const oldArchived = { date: '20250301', amount: 1, bankAccountKey: '', bookingKey: '' };
  assert.deepEqual(mergeArchivedPayments([oldArchived, native], archived), [archived[0], native]);
  const early = { date: '20250101', amount: 100, bankAccountKey: 'scs0077', bookingKey: 'bank-row-9' };
  assert.deepEqual(mergeArchivedPayments([early], archived).map(p => p.date), ['20250101', '20250310']);
});

test('an invoice with okr payments or reminders keeps its own state on a reconcile re-run', () => {
  assert.equal(hasNativeActivity({ payments: [{ bookingKey: '' }], reminders: [{ documentKey: 'bexio-reminder-7-1', bookingKey: '' }] }), false);
  assert.equal(hasNativeActivity({}), false);
  assert.equal(hasNativeActivity({ payments: [{ bookingKey: 'invoice-7-pay-Ab12Cd34Ef' }] }), true);
  assert.equal(hasNativeActivity({ reminders: [{ level: 2, documentKey: 'invoice-7-reminder-2', bookingKey: '' }] }), true);
});

test('deletableStale keeps stale invoices that carry okr activity and reports them', () => {
  const doc = (id, data) => ({ id, data: () => data });
  const local = [doc('1', {}), doc('2', { payments: [{ bookingKey: 'invoice-2-pay-Ab12Cd34Ef' }] }), doc('3', {}), doc('invoice-x', {})];
  assert.deepEqual(deletableStale(local, ['3']), { deletable: ['1'], skipped: ['2'] });
});
