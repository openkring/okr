import { describe, expect, it } from 'vitest';

import {
  applyTemplateDefaults, canCreateReminder, canEmailInvoice, configReminderFee, dunningTemplates, isReminderDue, lastDueDate, mahnlaufCandidates,
  newReminderFormModel, nextReminderLevel, parseReminderFee, ReminderLike, reminderDefaults, reminderDisplayName, reminderFeeSum, reminderLevelKey,
  waivableReminder, waiveInputProblem,
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
  });
  it('an invalid due date is never due and does not throw', () => {
    expect(isReminderDue(inv({ dueDate: '20261399' }), '20261231', 10)).toBe(false);
    expect(mahnlaufCandidates([inv({ dueDate: '20261399' })], '20261231', 10)).toEqual([]);
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

  it('offers a reminder on a payable invoice ', () => {
    expect(canCreateReminder(inv())).toBe(true);
    expect(canCreateReminder(inv({ state: 'unpaid', reminders: [r(1), r(2)] }))).toBe(true);
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

const tplQr = { okey: 'mahnung', name: 'Mahnung', category: 'dunning', status: 'published', isArchived: false, attachQrSlip: true };
const tplInf = { okey: 'erinnerung', name: 'Zahlungserinnerung', category: 'dunning', status: 'published', isArchived: false, attachQrSlip: false };
const names = { reminder_level_1: () => 'Zahlungserinnerung', reminder_level_2: () => '2. Mahnung', reminder_level_3: () => '3. Mahnung' } as never;

describe('1.90 reminder form rules', () => {
  it('lists published dunning templates only', () => {
    const list = [tplQr, tplInf, { ...tplQr, okey: 'x', status: 'draft' }, { ...tplQr, okey: 'y', category: 'invoice' }, { ...tplQr, okey: 'z', isArchived: true }];
    expect(dunningTemplates(list).map(t => t.okey)).toEqual(['mahnung', 'erinnerung']);
  });
  it('fee default with legacy fallback', () => {
    expect(configReminderFee({ reminderFee: 3000 })).toBe(3000);
    expect(configReminderFee({ reminderFees: [0, 2500, 4000] })).toBe(2500);
    expect(configReminderFee(undefined)).toBeGreaterThanOrEqual(0);
  });
  it('defaults follow the QR slip', () => {
    expect(reminderDefaults(tplQr, 2000)).toEqual({ feeChf: 20, channel: 'post', attachInvoice: false });
    expect(reminderDefaults(tplInf, 2000)).toEqual({ feeChf: 0, channel: 'email', attachInvoice: true });
    expect(reminderDefaults(undefined, 2000)).toEqual({ feeChf: 0, channel: 'email', attachInvoice: true });
  });
  it('a template change keeps what the treasurer touched', () => {
    const m = newReminderFormModel([tplInf, tplQr], 'erinnerung', 2000, 12000, '20261008');
    expect(m).toMatchObject({ templateId: 'erinnerung', feeChf: 0, channel: 'email', attachInvoice: true, openAmountChf: 120, date: '20261008' });
    const switched = applyTemplateDefaults({ ...m, templateId: 'mahnung', channel: 'email' }, tplQr, 2000, new Set(['channel']));
    expect(switched).toMatchObject({ templateId: 'mahnung', feeChf: 20, channel: 'email', attachInvoice: false });
  });
  it('preselects the configured template, else the first', () => {
    expect(newReminderFormModel([tplInf, tplQr], 'mahnung', 2000, 0, '20261008').templateId).toBe('mahnung');
    expect(newReminderFormModel([tplInf, tplQr], 'gone', 2000, 0, '20261008').templateId).toBe('erinnerung');
    expect(newReminderFormModel([], '', 2000, 0, '20261008').templateId).toBe('');
  });
  it('display name falls back for legacy reminders', () => {
    expect(reminderDisplayName({ level: 2, templateName: 'Mahnung' }, names)).toBe('Mahnung');
    expect(reminderDisplayName({ level: 1 }, names)).toBe('Zahlungserinnerung');
    expect(reminderDisplayName({ level: 3, templateName: '' }, names)).toBe('3. Mahnung');
  });
  it('no level limit', () => {
    const three: ReminderLike[] = [1, 2, 3].map(level => ({ level, date: '20261001', dueDate: '20261010' }));
    expect(canCreateReminder({ state: 'unpaid', reminders: three })).toBe(true);
    expect(isReminderDue({ state: 'unpaid', dueDate: '20260901', reminders: three }, '20261101', 10)).toBe(true);
    expect(mahnlaufCandidates([{ state: 'unpaid', dueDate: '20260901', reminders: three }], '20261101', 10)).toHaveLength(1);
  });
});
