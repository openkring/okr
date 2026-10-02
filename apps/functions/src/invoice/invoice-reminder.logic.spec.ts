import { describe, expect, it } from 'vitest';
import { defaultReminderFee, isReminderDue, nextReminderLevel, ReminderLike, reminderBlockers, reminderDueDate, reminderFeeLines, reminderFeeSum, reminderKey } from './invoice-reminder.logic';

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
  it('fee lines and keys', () => {
    expect(reminderFeeLines('r', 'f', 2000)).toEqual([
      { accountKey: 'r', debitAmount: { amount: 2000, currency: 'CHF' } },
      { accountKey: 'f', creditAmount: { amount: 2000, currency: 'CHF' } },
    ]);
    expect(reminderKey('abc', 2)).toBe('invoice-abc-reminder-2');
    expect(defaultReminderFee([0, 2000, 2000], 2)).toBe(2000);
    expect(defaultReminderFee(undefined, 1)).toBe(0);
    expect(reminderDueDate('20261020', 14)).toBe('20261103');
  });
});
