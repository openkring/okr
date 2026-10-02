import { describe, expect, it } from 'vitest';

import {
  canCreateReminder, canEmailInvoice, defaultReminderFee, isReminderDue, lastDueDate, latestReminderWithDocument, mahnlaufCandidates, nextReminderLevel,
  parseReminderFee, ReminderLike, reminderFeeSum, reminderInputProblem, reminderLevelKey, waivableReminder, waiveInputProblem,
} from './invoice-reminder.util';
import { invoiceRefusalReasons } from './invoice-position.util';
import { invoiceRefusalKeys } from './invoice-i18n';
import { openInvoiceAmount } from './invoice-payment.util';

const inv = (o = {}) => ({ state: 'pending', dueDate: '20261010', reminders: [] as ReminderLike[], ...o });

describe('invoice reminder util', () => {
  it('levels', () => {
    expect(nextReminderLevel([])).toBe(1);
    expect(nextReminderLevel([{ level: 1, date: '20261020', dueDate: '20261103' }])).toBe(2);
  });
  it('legacy reminders count as fee 0 and toward the level', () => {
    const legacy: ReminderLike[] = [{ level: 1, date: '20250101', dueDate: '20250115' }];
    expect(reminderFeeSum(legacy)).toBe(0);
    expect(nextReminderLevel(legacy)).toBe(2);
    expect(reminderFeeSum([{ level: 1, date: 'd', dueDate: 'd', fee: 2000 }] as ReminderLike[])).toBe(2000);
  });
  it('due for the Mahnlauf', () => {
    expect(isReminderDue(inv(), '20261021', 10)).toBe(true);
    expect(isReminderDue(inv(), '20261020', 10)).toBe(false);
    expect(isReminderDue(inv({ reminders: [{ level: 1, date: '20261021', dueDate: '20261104' }] }), '20261110', 10)).toBe(false);
    expect(isReminderDue(inv({ state: 'paid' }), '20261231', 10)).toBe(false);
    const three = [1, 2, 3].map(level => ({ level, date: '20250101', dueDate: '20250115' }));
    expect(isReminderDue(inv({ reminders: three }), '20261231', 10)).toBe(false);
  });
  it('an invalid due date is never due and does not throw', () => {
    expect(isReminderDue(inv({ dueDate: '20261399' }), '20261231', 10)).toBe(false);
    expect(mahnlaufCandidates([inv({ dueDate: '20261399' })], '20261231', 10)).toEqual([]);
  });
  it('default fee', () => {
    expect(defaultReminderFee([0, 2000, 2000], 2)).toBe(2000);
    expect(defaultReminderFee(undefined, 1)).toBe(0);
    expect(defaultReminderFee(undefined, 2)).toBe(0);
    expect(defaultReminderFee(undefined, 3)).toBe(0);
    expect(defaultReminderFee([500], 2)).toBe(0);
    expect(defaultReminderFee([-5], 1)).toBe(0);
  });
  it('a legacy reminder without dueDate counts from its date', () => {
    const legacy = inv({ dueDate: '20261001', reminders: [{ level: 1, date: '20261020', dueDate: '' }] });
    expect(lastDueDate(legacy)).toBe('20261020');
    expect(isReminderDue(legacy, '20261031', 10)).toBe(true);
    expect(isReminderDue(legacy, '20261030', 10)).toBe(false);
  });
  it('candidates: due ones, longest overdue first', () => {
    const a = inv({ dueDate: '20261015' });
    const b = inv({ dueDate: '20261001' });
    const c = inv({ dueDate: '20261110' });
    const paid = inv({ dueDate: '20260901', state: 'paid' });
    expect(mahnlaufCandidates([a, b, c, paid], '20261115', 10)).toEqual([b, a]);
    expect(lastDueDate(a)).toBe('20261015');
  });
});

describe('reminder actions (client)', () => {
  const r = (level: number, documentKey = ''): ReminderLike & { documentKey: string } => ({ level, date: '20261020', dueDate: '20261103', documentKey });

  it('names the level', () => {
    expect(reminderLevelKey(1)).toBe('reminder_level_1');
    expect(reminderLevelKey(2)).toBe('reminder_level_2');
    expect(reminderLevelKey(3)).toBe('reminder_level_3');
  });

  it('offers a reminder on a payable invoice with a level left', () => {
    expect(canCreateReminder(inv())).toBe(true);
    expect(canCreateReminder(inv({ state: 'unpaid', reminders: [r(1), r(2)] }))).toBe(true);
    expect(canCreateReminder(inv({ reminders: [r(1), r(2), r(3)] }))).toBe(false);
    expect(canCreateReminder(inv({ state: 'paid' }))).toBe(false);
    expect(canCreateReminder(inv({ state: 'draft' }))).toBe(false);
  });

  it('mails an issued invoice that has a PDF', () => {
    expect(canEmailInvoice({ state: 'pending', documentKey: 'd' })).toBe(true);
    expect(canEmailInvoice({ state: 'paid', documentKey: 'd' })).toBe(true);
    expect(canEmailInvoice({ state: 'pending', documentKey: '' })).toBe(false);
    expect(canEmailInvoice({ state: 'draft', documentKey: 'd' })).toBe(false);
    expect(canEmailInvoice({ state: 'issuing', documentKey: 'd' })).toBe(false);
    expect(canEmailInvoice({ state: 'cancelled', documentKey: 'd' })).toBe(false);
  });

  it('picks the highest reminder that has a PDF', () => {
    expect(latestReminderWithDocument([r(1, 'a'), r(2, 'b'), r(3)])?.documentKey).toBe('b');
    expect(latestReminderWithDocument([r(1)])).toBeUndefined();
    expect(latestReminderWithDocument(undefined)).toBeUndefined();
  });

  it('parses a fee in CHF with at most two decimals', () => {
    expect(parseReminderFee('20')).toBe(20);
    expect(parseReminderFee('20,5')).toBe(20.5);
    expect(parseReminderFee(' 0.05 ')).toBe(0.05);
    expect(parseReminderFee(0)).toBe(0);
    expect(parseReminderFee('-1')).toBeUndefined();
    expect(parseReminderFee('1.234')).toBeUndefined();
    expect(parseReminderFee('')).toBeUndefined();
    expect(parseReminderFee('abc')).toBeUndefined();
  });

  it('checks the alert input: a full date first, then the fee', () => {
    expect(reminderInputProblem('20261020', '20.00')).toBeUndefined();
    expect(reminderInputProblem('', '20')).toBe('date');
    expect(reminderInputProblem('20261340', '20')).toBe('date');
    expect(reminderInputProblem('20261020', '-5')).toBe('fee');
  });

  it('names a refused reminder mail of a paid or cancelled invoice in the email context', () => {
    expect(invoiceRefusalKeys(['not-payable'], 'email')).toEqual(['refusal_email_not_payable']);
    expect(invoiceRefusalKeys(['not-sendable'], 'email')).toEqual(['refusal_email_not_sendable']);
    expect(invoiceRefusalKeys(['not-payable'], 'reminder')).toEqual(['refusal_reminder_not_payable']);
  });

  it('expands the blockers of a reminder-blocked refusal', () => {
    expect(invoiceRefusalReasons({ details: { reason: 'reminder-blocked', reasons: ['max-level', 'invalid-fee'] } })).toEqual(['max-level', 'invalid-fee']);
  });

  describe('fee waiver (1.76 D18)', () => {
    const w = (level: number, o = {}) => ({ level, date: '20261020', dueDate: '20261104', fee: 2000, bookingKey: `b${level}`, waivedAt: '', ...o });

    it('reminderFeeSum skips waived reminders', () => {
      expect(reminderFeeSum([w(1), w(2, { waivedAt: '20261101' })] as never)).toBe(2000);
      expect(reminderFeeSum([w(1, { waivedAt: '20261101' })] as never)).toBe(0);
    });

    it('the open amount leaves out waived fees', () => {
      const invoice = { totalAmount: { amount: 10000, currency: 'CHF' }, payments: [], reminders: [w(1, { waivedAt: '20261101' }), w(2)] } as never;
      expect(openInvoiceAmount(invoice)).toBe(12000);
    });

    it('waivableReminder returns the highest level with a fee, a booking and no waiver', () => {
      expect(waivableReminder(inv({ reminders: [w(1), w(2)] }) as never)?.level).toBe(2);
      expect(waivableReminder(inv({ reminders: [w(1), w(2, { waivedAt: '20261101' })] }) as never)?.level).toBe(1);
    });

    it('waivableReminder skips reminders without fee or booking', () => {
      expect(waivableReminder(inv({ reminders: [w(1), w(2, { fee: 0 })] }) as never)?.level).toBe(1);
      expect(waivableReminder(inv({ reminders: [w(1, { bookingKey: '' })] }) as never)).toBeUndefined();
      expect(waivableReminder(inv({ reminders: [{ level: 1, date: 'd', dueDate: 'd' }] }) as never)).toBeUndefined();
    });

    it('waivableReminder needs a payable invoice and reminders', () => {
      expect(waivableReminder(inv({ state: 'paid', reminders: [w(1)] }) as never)).toBeUndefined();
      expect(waivableReminder(inv({ state: 'cancelled', reminders: [w(1)] }) as never)).toBeUndefined();
      expect(waivableReminder(inv() as never)).toBeUndefined();
    });

    it('waivableReminder takes the highest level even when it is the waived one', () => {
      expect(waivableReminder(inv({ reminders: [w(1), w(2, { waivedAt: '20261101' })] }) as never)?.level).toBe(1);
    });

    it('waiveInputProblem mirrors the server', () => {
      expect(waiveInputProblem('Kulanz', '20261101')).toBeUndefined();
      expect(waiveInputProblem('  ', '20261101')).toBe('reason');
      expect(waiveInputProblem('x'.repeat(501), '20261101')).toBe('reason');
      expect(waiveInputProblem('x'.repeat(500), '20261101')).toBeUndefined();
      expect(waiveInputProblem('Kulanz', '')).toBe('date');
      expect(waiveInputProblem('Kulanz', '2026')).toBe('date');
    });

    it('expands the blockers of a waive-blocked refusal and gives each reason a text', () => {
      const reasons = ['no-reminder', 'no-fee', 'already-waived', 'no-waive-date', 'invalid-reason'];
      expect(invoiceRefusalReasons({ details: { reason: 'waive-blocked', reasons } })).toEqual(reasons);
      expect(invoiceRefusalKeys([...reasons, 'no-fee-booking', 'waive-blocked']).length).toBe(7);
    });

    it('the waive context has its own not-payable text, and account-invalid reuses the reminder one', () => {
      expect(invoiceRefusalKeys(['not-payable'], 'waive')).toEqual(['refusal_waive_not_payable']);
      expect(invoiceRefusalKeys(['account-invalid'], 'waive')).toEqual(['refusal_reminder_account_invalid']);
      expect(invoiceRefusalKeys(['already-waived'], 'email')).toEqual(['refusal_email_already_waived']);
    });
  });
});
