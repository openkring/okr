import { describe, expect, it } from 'vitest';

import { AttendanceEntry, AvatarInfo, CalEventModel, CourseFinanceModel, MoneyModel } from '@okr/shared-models';

import { computeCompensation, countLedTrainings, unlistedLeaders, yearlyTotals } from './course-compensation.util';

function avatar(key: string): AvatarInfo {
  return { key, name1: key, name2: key, modelType: 'person', type: '', subType: '', label: '' };
}

function entry(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function']): AttendanceEntry {
  return { person: avatar(key), presence, function: fn, by: 'pT', at: '20261016120000' };
}

function event(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function'], over: Partial<CalEventModel> = {}): CalEventModel {
  const e = new CalEventModel('scs');
  e.okey = 'e' + Math.random().toString(36).slice(2, 8);
  e.startDate = '20261015';
  e.startTime = '19:00';
  e.attendance = { [key]: entry(key, presence, fn) };
  return Object.assign(e, over);
}

const led = (key: string, presence: AttendanceEntry['presence'], over: Partial<CalEventModel> = {}) => event(key, presence, 'leader', over);
const part = (key: string, presence: AttendanceEntry['presence'], over: Partial<CalEventModel> = {}) => event(key, presence, 'participant', over);

function financeOf(over: Partial<CourseFinanceModel> = {}): CourseFinanceModel {
  return Object.assign(new CourseFinanceModel(), { defaultRate: new MoneyModel(5000), eligible: [{ person: avatar('p1') }] }, over);
}

describe('countLedTrainings', () => {
  it('counts only leader + present on non-cancelled, non-archived events with entries', () => {
    const evs = [
      led('p1', 'present'),
      led('p1', 'absent'),
      led('p1', 'present', { state: 'cancelled' }),
      led('p1', 'present', { isArchived: true }),
      part('p1', 'present'),
    ];
    expect(countLedTrainings(evs, 'p1')).toBe(1);
  });

  it('does not count excused leaders, other persons or events without attendance', () => {
    const none = new CalEventModel('scs');
    (none as { attendance?: unknown }).attendance = undefined;
    expect(countLedTrainings([led('p1', 'excused'), led('p2', 'present'), none], 'p1')).toBe(0);
  });
});

describe('computeCompensation', () => {
  it('own rate overrides the default; amount = count x rate', () => {
    const fin = financeOf({ eligible: [{ person: avatar('p1') }, { person: avatar('p2'), rate: new MoneyModel(8000) }] });
    const lines = computeCompensation([led('p1', 'present'), led('p2', 'present'), led('p2', 'present')], fin);
    expect(lines.map(l => l.amount)).toEqual([5000, 16000]);
    expect(lines.map(l => l.ledCount)).toEqual([1, 2]);
    expect(lines.map(l => l.rate.amount)).toEqual([5000, 8000]);
  });

  it('eligible person with zero trainings still gets a line with amount 0', () => {
    const lines = computeCompensation([], financeOf());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ ledCount: 0, amount: 0 });
    expect(lines[0].person.key).toBe('p1');
  });

  it('ignores cancelled and archived events', () => {
    const lines = computeCompensation([led('p1', 'present'), led('p1', 'present', { state: 'cancelled' })], financeOf());
    expect(lines[0].amount).toBe(5000);
  });
});

describe('unlistedLeaders', () => {
  it('returns leaders who led but are not eligible', () => {
    expect(unlistedLeaders([led('pX', 'present')], financeOf()).map(a => a.key)).toEqual(['pX']);
  });

  it('skips eligible persons, absent leaders and participants, and lists each person once', () => {
    const evs = [led('p1', 'present'), led('pA', 'absent'), part('pB', 'present'), led('pX', 'present'), led('pX', 'present')];
    expect(unlistedLeaders(evs, financeOf()).map(a => a.key)).toEqual(['pX']);
  });
});

describe('yearlyTotals', () => {
  it('groups by booking year', () => {
    expect(
      yearlyTotals([
        { date: '20261231', personKey: 'p1', amount: 100 },
        { date: '20270102', personKey: 'p1', amount: 50 },
      ]),
    ).toEqual({ '2026': { p1: 100 }, '2027': { p1: 50 } });
  });

  it('sums several bookings of one person in a year', () => {
    expect(
      yearlyTotals([
        { date: '20260301', personKey: 'p1', amount: 100 },
        { date: '20261101', personKey: 'p1', amount: 50 },
        { date: '20261101', personKey: 'p2', amount: 7 },
      ]),
    ).toEqual({ '2026': { p1: 150, p2: 7 } });
  });
});
