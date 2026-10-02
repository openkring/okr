import { describe, expect, it } from 'vitest';
import { coalesceReminder, defaultReminderFee, isReminderDue, lastDueDate, nextReminderLevel, ReminderLike, reminderBlockers, reminderDueDate, reminderFeeLines, reminderFeeSum, reminderKey, unwaivedFeeKeys, waiveBlockers, waiverKey } from './invoice-reminder.logic';

const inv = (o = {}) => ({ state: 'pending', dueDate: '20261010', reminders: [] as ReminderLike[], ...o });

describe('invoice reminder logic', () => {
  it('levels', () => {
    expect(nextReminderLevel([])).toBe(1);
    expect(nextReminderLevel([{ level: 1, date: '20261020', dueDate: '20261103' }])).toBe(2);
  });
  it('blockers', () => {
    expect(reminderBlockers(inv(), 1, '20261020', 2000)).toEqual([]);
    expect(reminderBlockers(inv({ state: 'paid' }), 1, '20261020', 0)).toContain('not-payable');
    expect(reminderBlockers(inv({ state: 'unpaid' }), 1, '20261020', 0)).toEqual([]);
    expect(reminderBlockers(inv(), 2, '20261020', 0)).toContain('level-mismatch');
    const three = [1, 2, 3].map(level => ({ level, date: '20261020', dueDate: '20261103' }));
    expect(reminderBlockers(inv({ reminders: three }), 4, '20261020', 0)).toContain('max-level');
    expect(reminderBlockers(inv(), 1, '20261399', 0)).toContain('no-reminder-date');
    expect(reminderBlockers(inv(), 1, '20261020', -1)).toContain('invalid-fee');
    expect(reminderBlockers(inv(), 1, '20261020', 10.5)).toContain('invalid-fee');
  });
  it('legacy reminders count as fee 0 and toward the level', () => {
    const legacy = [{ level: 1, date: '20250101', dueDate: '20250115' }];
    expect(reminderFeeSum(legacy)).toBe(0);
    expect(nextReminderLevel(legacy)).toBe(2);
  });
  it('due for the Mahnlauf', () => {
    expect(isReminderDue(inv(), '20261021', 10)).toBe(true);
    expect(isReminderDue(inv(), '20261020', 10)).toBe(false);
    expect(isReminderDue(inv({ reminders: [{ level: 1, date: '20261021', dueDate: '20261104' }] }), '20261110', 10)).toBe(false);
    expect(isReminderDue(inv({ state: 'paid' }), '20261231', 10)).toBe(false);
  });
  it('an invalid due date is never due', () => {
    expect(isReminderDue(inv({ dueDate: '20261399' }), '20261231', 10)).toBe(false);
  });
  it('fee lines and keys', () => {
    expect(reminderFeeLines('r', 'f', 2000)).toEqual([
      { accountKey: 'r', debitAmount: { amount: 2000, currency: 'CHF' } },
      { accountKey: 'f', creditAmount: { amount: 2000, currency: 'CHF' } },
    ]);
    expect(reminderKey('abc', 2)).toBe('invoice-abc-reminder-2');
    expect(defaultReminderFee([0, 2000, 2000], 2)).toBe(2000);
    expect(reminderDueDate('20261020', 14)).toBe('20261103');
  });
  it('default fee: a config without the field uses the model default [0, 0, 0] (P3-R2)', () => {
    expect(defaultReminderFee(undefined, 1)).toBe(0);
    expect(defaultReminderFee(undefined, 2)).toBe(0);
    expect(defaultReminderFee(undefined, 3)).toBe(0);
    expect(defaultReminderFee([500], 2)).toBe(0);
    expect(defaultReminderFee([-5], 1)).toBe(0);
  });
  it('a legacy reminder without dueDate counts from its date', () => {
    const legacy = { dueDate: '20261001', reminders: [{ level: 1, date: '20261020', dueDate: '' }] };
    expect(lastDueDate(legacy)).toBe('20261020');
    expect(isReminderDue({ state: 'pending', ...legacy }, '20261031', 10)).toBe(true);
    expect(isReminderDue({ state: 'pending', ...legacy }, '20261030', 10)).toBe(false);
    expect(lastDueDate({ dueDate: '20261001', reminders: [{ level: 1, date: '20261020', dueDate: '20261103' }] })).toBe('20261103');
  });

  describe('fee waiver (D18)', () => {
    const rem = (o = {}): ReminderLike => ({ level: 2, date: '20261020', dueDate: '20261103', fee: 2000, bookingKey: 'invoice-abc-reminder-2', ...o });
    const waivable = (o = {}) => inv({ reminders: [rem(o)] });
    it('waiverKey', () => {
      expect(waiverKey('abc', 2)).toBe('invoice-abc-reminder-2-waiver');
    });
    it('no blockers for a waivable fee', () => {
      expect(waiveBlockers(waivable(), 2, '20261105', 'Kulanz')).toEqual([]);
    });
    it('not-payable, no-reminder, no-fee, already-waived, no-waive-date, invalid-reason', () => {
      expect(waiveBlockers(inv({ state: 'paid', reminders: [rem()] }), 2, '20261105', 'x')).toContain('not-payable');
      expect(waiveBlockers(waivable(), 3, '20261105', 'x')).toContain('no-reminder');
      expect(waiveBlockers(waivable({ fee: 0 }), 2, '20261105', 'x')).toContain('no-fee');
      expect(waiveBlockers(waivable({ fee: undefined }), 2, '20261105', 'x')).toContain('no-fee');
      expect(waiveBlockers(waivable({ waivedAt: '20261101' }), 2, '20261105', 'x')).toContain('already-waived');
      expect(waiveBlockers(waivable(), 2, '20261399', 'x')).toContain('no-waive-date');
      expect(waiveBlockers(waivable(), 2, '20261105', '   ')).toContain('invalid-reason');
      expect(waiveBlockers(waivable(), 2, '20261105', 'y'.repeat(501))).toContain('invalid-reason');
      expect(waiveBlockers(waivable(), 2, '20261105', 'y'.repeat(500))).toEqual([]);
    });
    it('a fee without booking key is no-fee (nothing to reverse)', () => {
      expect(waiveBlockers(waivable({ bookingKey: '' }), 2, '20261105', 'x')).toContain('no-fee');
    });
    it('unwaivedFeeKeys skips waived reminders and empty keys, deduplicated', () => {
      expect(unwaivedFeeKeys([
        rem({ level: 1, bookingKey: 'a' }), rem({ level: 2, bookingKey: 'b', waivedAt: '20261101' }), rem({ level: 3, bookingKey: '' }), rem({ level: 4, bookingKey: 'a' }),
      ])).toEqual(['a']);
    });
  });

  describe('coalesceReminder', () => {
    it('keeps the waiver fields and defaults them to empty strings', () => {
      const waived = coalesceReminder({ level: 2, date: '20261020', dueDate: '20261103', fee: 2000, bookingKey: 'b', waivedAt: '20261105', waiveBookingKey: 'w' });
      expect(waived.waivedAt).toBe('20261105');
      expect(waived.waiveBookingKey).toBe('w');
      const legacy = coalesceReminder({ level: 1, date: '20261020', dueDate: '20261103' });
      expect(legacy).toEqual({ level: 1, date: '20261020', dueDate: '20261103', isSent: false, documentKey: '', fee: 0, bookingKey: '', waivedAt: '', waiveBookingKey: '' });
    });
  });
});
