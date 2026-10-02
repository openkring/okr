import { describe, expect, it } from 'vitest';
import { ContractModel } from '@okr/shared-models';
import { planReminders, planTransition, pruneMarkers, reminderMarker } from './contract-reminder.util';

const c = (p: Partial<ContractModel>) => Object.assign(new ContractModel('t1'), { state: 'active' }, p);

describe('planReminders', () => {
  it('nothing outside the largest window', () => {
    expect(planReminders(c({ endDate: '20271231' }), '20270101')).toEqual([]);
  });
  it('one reminder for the 90-day window', () => {
    expect(planReminders(c({ endDate: '20271231' }), '20271002')).toEqual([
      { kind: 'end', deadline: '20271231', leadDays: 90, markers: ['end:20271231:90'] },
    ]);
  });
  it('created 5 days before → ONE reminder (7), all crossed windows marked', () => {
    expect(planReminders(c({ endDate: '20271231' }), '20271226')).toEqual([
      { kind: 'end', deadline: '20271231', leadDays: 7, markers: ['end:20271231:90', 'end:20271231:30', 'end:20271231:7'] },
    ]);
  });
  it('already sent → nothing', () => {
    const sent = [reminderMarker('end', '20271231', 90)];
    expect(planReminders(c({ endDate: '20271231', remindersSent: sent }), '20271010')).toEqual([]);
  });
  it('custom lead days', () => {
    expect(planReminders(c({ endDate: '20271231', reminderLeadDays: [14] }), '20271220')).toEqual([
      { kind: 'end', deadline: '20271231', leadDays: 14, markers: ['end:20271231:14'] },
    ]);
  });
  it('deadline day itself (0 days left) still reminds', () => {
    expect(planReminders(c({ endDate: '20271231', reminderLeadDays: [7] }), '20271231')[0]?.leadDays).toBe(7);
  });
});

describe('pruneMarkers', () => {
  it('drops markers whose deadline is past', () => {
    expect(pruneMarkers(['end:20261231:7', 'notice:20270930:30'], '20270101')).toEqual(['notice:20270930:30']);
  });
});

describe('planTransition', () => {
  it('notice given, effective end passed → ended', () => {
    expect(planTransition(c({ state: 'noticeGiven', effectiveEndDate: '20261231' }), '20270101'))
      .toEqual({ state: 'ended', event: 'contract.ended' });
  });
  it('fixed term passed, no renewal → ended', () => {
    expect(planTransition(c({ endDate: '20261231' }), '20270101')).toEqual({ state: 'ended', event: 'contract.ended' });
  });
  it('renewing term passed → endDate rolled', () => {
    expect(planTransition(c({ endDate: '20251231', autoRenewMonths: 12 }), '20270101'))
      .toEqual({ endDate: '20271231', event: 'contract.renewed' });
  });
  it('multi-cycle renewal rolls to the first end on/after today', () => {
    expect(planTransition(c({ endDate: '20231231', autoRenewMonths: 12 }), '20270101'))
      .toEqual({ endDate: '20271231', event: 'contract.renewed' });
  });
  it('fractional autoRenewMonths terminates (no hang)', () => {
    expect(planTransition(c({ endDate: '20231231', autoRenewMonths: 0.5 }), '20270101')).toBeDefined();
  });
  it('end date is today → no transition yet', () => {
    expect(planTransition(c({ endDate: '20270101' }), '20270101')).toBeUndefined();
  });
  it('draft never transitions', () => {
    expect(planTransition(c({ state: 'draft', endDate: '20261231' }), '20270101')).toBeUndefined();
  });
});
