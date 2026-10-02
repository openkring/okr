import { describe, expect, it } from 'vitest';

import { defaultReminderFee, isReminderDue, lastDueDate, mahnlaufCandidates, nextReminderLevel, ReminderLike, reminderFeeSum } from './invoice-reminder.util';

const inv = (o = {}) => ({ state: 'pending', dueDate: '20261010', reminders: [] as ReminderLike[], ...o });

describe('invoice reminder util', () => {
  it('levels', () => {
    expect(nextReminderLevel([])).toBe(1);
    expect(nextReminderLevel([{ level: 1, date: '20261020', dueDate: '20261103' }])).toBe(2);
  });
  it('legacy reminders count as fee 0 and toward the level', () => {
    const legacy = [{ level: 1, date: '20250101', dueDate: '20250115' }];
    expect(reminderFeeSum(legacy)).toBe(0);
    expect(nextReminderLevel(legacy)).toBe(2);
    expect(reminderFeeSum([{ level: 1, date: 'd', dueDate: 'd', fee: 2000 }])).toBe(2000);
  });
  it('due for the Mahnlauf', () => {
    expect(isReminderDue(inv(), '20261021', 10)).toBe(true);
    expect(isReminderDue(inv(), '20261020', 10)).toBe(false);
    expect(isReminderDue(inv({ reminders: [{ level: 1, date: '20261021', dueDate: '20261104' }] }), '20261110', 10)).toBe(false);
    expect(isReminderDue(inv({ state: 'paid' }), '20261231', 10)).toBe(false);
    const three = [1, 2, 3].map(level => ({ level, date: '20250101', dueDate: '20250115' }));
    expect(isReminderDue(inv({ reminders: three }), '20261231', 10)).toBe(false);
  });
  it('default fee', () => {
    expect(defaultReminderFee([0, 2000, 2000], 2)).toBe(2000);
    expect(defaultReminderFee(undefined, 1)).toBe(0);
    expect(defaultReminderFee([-5], 1)).toBe(0);
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
