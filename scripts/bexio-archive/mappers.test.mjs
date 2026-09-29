import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToStoreDate, toRappen, accountOkey, mapInvoiceState, mapBillState, fileOkey, filePath,
  mapInvoicePayment, mapReminder, mapComment, mapBillPayment, staleIds,
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
    { date: '20260501', amount: 8000, bankAccountKey: 'scs0021' });
  assert.equal(mapInvoicePayment({ date: '2026-05-01', value: '80.00', bank_account_id: null }, 'scs', bank).bankAccountKey, '');
  assert.deepEqual(mapReminder({ reminder_level: 2, is_valid_from: '2026-06-01', is_valid_to: '2026-06-15', is_sent: true }, 'bexio-reminder-1-2'),
    { level: 2, date: '20260601', dueDate: '20260615', isSent: true, documentKey: 'bexio-reminder-1-2' });
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
