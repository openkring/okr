import { describe, expect, it } from 'vitest';
import { coalesceReminder, configReminderFee, dunningTemplateRefusal, isReminderDue, isValidRequestId, lastDueDate, markReminderSent, nextReminderLevel, ReminderLike, reminderBlockers, reminderByRequest, reminderDisplayName, reminderDueDate, reminderFeeLines, reminderFeeSum, reminderKey, unwaivedFeeKeys, waiveBlockers, waiverKey } from './invoice-reminder.logic';

const inv = (o = {}) => ({ state: 'pending', dueDate: '20261010', reminders: [] as ReminderLike[], ...o });

describe('invoice reminder logic', () => {
  it('levels', () => {
    expect(nextReminderLevel([])).toBe(1);
    expect(nextReminderLevel([{ level: 1, date: '20261020', dueDate: '20261103' }])).toBe(2);
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
    expect(reminderDueDate('20261020', 14)).toBe('20261103');
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
      expect(legacy).toEqual({ level: 1, date: '20261020', dueDate: '20261103', isSent: false, documentKey: '', fee: 0, bookingKey: '', waivedAt: '', waiveBookingKey: '', templateId: '', templateName: '', sentAt: '', sentVia: '', requestId: '' });
    });
  });
});

describe('1.90 free dunning rules', () => {
  it('blockers no longer know levels', () => {
    expect(reminderBlockers(inv(), '20261020', 2000)).toEqual([]);
    expect(reminderBlockers(inv({ state: 'paid' }), '20261020', 0)).toEqual(['not-payable']);
    expect(reminderBlockers(inv(), '20261399', 0)).toEqual(['no-reminder-date']);
    expect(reminderBlockers(inv(), '20261020', -1)).toEqual(['invalid-fee']);
    expect(reminderBlockers(inv(), '20261020', 10.5)).toEqual(['invalid-fee']);
  });
  it('running number has no upper limit', () => {
    const four = [1, 2, 3, 4].map(level => ({ level, date: '20261020', dueDate: '20261103' }));
    expect(nextReminderLevel(four)).toBe(5);
    expect(isReminderDue(inv({ reminders: four }), '20261120', 10)).toBe(true);
  });
  it('finds a reminder by request id', () => {
    const r: ReminderLike = { level: 2, date: 'd', dueDate: 'd', requestId: 'abc-1' };
    expect(reminderByRequest([r], 'abc-1')).toBe(r);
    expect(reminderByRequest([r], 'other')).toBeUndefined();
    expect(reminderByRequest([{ level: 1, date: 'd', dueDate: 'd' }], '')).toBeUndefined();
  });
  it('validates request ids', () => {
    expect(isValidRequestId('3f0c9a5e-1b2c-4d3e-8f90-a1b2c3d4e5f6')).toBe(true);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('a'.repeat(65))).toBe(false);
    expect(isValidRequestId('bad id')).toBe(false);
    expect(isValidRequestId(42)).toBe(false);
  });
  it('checks the template', () => {
    const ok = { tenants: ['scs'], category: 'dunning', status: 'published', isArchived: false, name: 'Mahnung' };
    expect(dunningTemplateRefusal(ok, 'scs')).toBeUndefined();
    expect(dunningTemplateRefusal(undefined, 'scs')).toBe('no-reminder-template');
    expect(dunningTemplateRefusal({ ...ok, tenants: ['gss'] }, 'scs')).toBe('no-reminder-template');
    expect(dunningTemplateRefusal({ ...ok, isArchived: true }, 'scs')).toBe('no-reminder-template');
    expect(dunningTemplateRefusal({ ...ok, status: 'draft' }, 'scs')).toBe('no-reminder-template');
    expect(dunningTemplateRefusal({ ...ok, category: 'invoice' }, 'scs')).toBe('template-not-dunning');
  });
  it('default fee with legacy fallback', () => {
    expect(configReminderFee({ reminderFee: 3000 })).toBe(3000);
    expect(configReminderFee({ reminderFees: [0, 2500, 4000] })).toBe(2500);
    expect(configReminderFee({})).toBe(0); // DEFAULT_REMINDER_FEES[1]
    expect(configReminderFee({ reminderFee: -5 })).toBe(0);
  });
  it('display name falls back to the level naming', () => {
    expect(reminderDisplayName({ level: 2, templateName: 'Mahnung' })).toBe('Mahnung');
    expect(reminderDisplayName({ level: 1 })).toBe('Zahlungserinnerung');
    expect(reminderDisplayName({ level: 2, templateName: '' })).toBe('2. Mahnung');
  });
  it('marks one reminder as sent', () => {
    const list: ReminderLike[] = [{ level: 1, date: 'd', dueDate: 'd', documentKey: 'k1' }, { level: 2, date: 'd', dueDate: 'd', documentKey: 'k2' }];
    const out = markReminderSent(list, 'k2', '20261008', 'post');
    expect(out?.[1]).toMatchObject({ isSent: true, sentAt: '20261008', sentVia: 'post' });
    expect(out?.[0]).toMatchObject({ isSent: false, sentAt: '', sentVia: '' });
    expect(markReminderSent(list, 'nope', '20261008', 'post')).toBeUndefined();
  });
  it('coalesces the new fields', () => {
    expect(coalesceReminder({ level: 1, date: 'd', dueDate: 'd' })).toMatchObject({ templateId: '', templateName: '', sentAt: '', sentVia: '', requestId: '' });
  });
});
