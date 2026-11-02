import { describe, expect, it } from 'vitest';

import { AttendanceEntry, AvatarInfo, CalEventModel, CourseFinanceModel, MoneyModel } from '@okr/shared-models';

import { computeCompensation, countLedTrainings, unlistedLeaders, yearlyTotalRows, yearlyTotals } from './course-compensation.util';

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

describe('yearlyTotalRows', () => {
  const posted = [
    { date: '20261015', personKey: 'p1', name: 'Anna Muster', amount: 4000 },
    { date: '20261220', personKey: 'p2', name: 'Beat Beispiel', amount: 9000 },
    { date: '20261221', personKey: 'p1', name: '', amount: 3000 },
    { date: '20270105', personKey: 'p1', name: 'Anna Muster', amount: 1000 },
  ];

  it('lists the newest year first, with the largest amount first inside a year and the year sum', () => {
    const rows = yearlyTotalRows(posted);
    expect(rows.map(r => r.year)).toEqual(['2027', '2026']);
    expect(rows[1].persons.map(p => p.personKey)).toEqual(['p2', 'p1']);
    expect(rows[1].persons[1].amount).toBe(7000);
    expect(rows[1].sum).toBe(16000);
  });

  it('uses the first non-empty name of a person, and the key when no booking has one', () => {
    expect(yearlyTotalRows(posted)[1].persons.find(p => p.personKey === 'p1')?.name).toBe('Anna Muster');
    expect(yearlyTotalRows([{ date: '20261015', personKey: 'p7', amount: 100 }])[0].persons[0].name).toBe('p7');
  });

  it('breaks a tie by name, and is empty without bookings', () => {
    const tie = yearlyTotalRows([
      { date: '20261001', personKey: 'b', name: 'Zora', amount: 100 },
      { date: '20261001', personKey: 'a', name: 'Alma', amount: 100 },
    ]);
    expect(tie[0].persons.map(p => p.name)).toEqual(['Alma', 'Zora']);
    expect(yearlyTotalRows([])).toEqual([]);
  });
});
