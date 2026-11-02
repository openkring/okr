import { describe, expect, it } from 'vitest';

import { AvatarInfo, Attendee, AttendanceEntry, CalEventModel, CourseModel, MembershipModel } from '@okr/shared-models';

import {
  buildCourseTable,
  courseEventStarted,
  courseEvents,
  courseRowPersons,
  isMemberDuring,
  prefillAttendance,
  unconfirmedPastEvents,
} from './course-table.util';

const TODAY = '20261101';

function avatar(key: string, name1 = key, name2 = key): AvatarInfo {
  return { key, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

function m(dateOfEntry: string, dateOfExit: string, key = 'pM', name2 = key): MembershipModel {
  const ms = new MembershipModel('scs');
  ms.memberKey = key;
  ms.memberName1 = 'Vor' + key;
  ms.memberName2 = name2;
  ms.memberModelType = 'person';
  ms.orgKey = 'g1';
  ms.orgModelType = 'group';
  ms.dateOfEntry = dateOfEntry;
  ms.dateOfExit = dateOfExit;
  return ms;
}

function ev(attendees: { key: string; state: Attendee['state'] }[] = [], over: Partial<CalEventModel> = {}): CalEventModel {
  const e = new CalEventModel('scs');
  e.okey = 'e' + Math.random().toString(36).slice(2, 8);
  e.startDate = '20261015';
  e.startTime = '19:00';
  e.type = 'training';
  e.attendees = attendees.map(a => ({ person: avatar(a.key), state: a.state }));
  return Object.assign(e, over);
}

function course(over: Partial<CourseModel> = {}): CourseModel {
  const c = new CourseModel('scs');
  c.okey = 'c1';
  c.groupKey = 'g1';
  c.startDate = '20260801';
  c.endDate = '20270731';
  c.typeMapping = { training: 'Training' };
  return Object.assign(c, over);
}

function entry(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function'] = 'participant'): AttendanceEntry {
  return { person: avatar(key), presence, function: fn, by: 'pT', at: '20261016120000' };
}

describe('courseEvents', () => {
  it('drops archived and cancelled events and sorts by start date and time', () => {
    const late = ev([], { okey: 'late', startDate: '20261020', startTime: '09:00' });
    const early = ev([], { okey: 'early', startDate: '20261020', startTime: '08:00' });
    const first = ev([], { okey: 'first', startDate: '20261001' });
    const archived = ev([], { okey: 'arch', isArchived: true });
    const cancelled = ev([], { okey: 'canc', state: 'cancelled' });
    expect(courseEvents([late, archived, early, cancelled, first]).map(e => e.okey)).toEqual(['first', 'early', 'late']);
  });

  it('does not mutate its input', () => {
    const a = ev([], { okey: 'a', startDate: '20261020' });
    const b = ev([], { okey: 'b', startDate: '20261001' });
    const input = [a, b];
    courseEvents(input);
    expect(input.map(e => e.okey)).toEqual(['a', 'b']);
  });
});

describe('isMemberDuring', () => {
  it('overlaps inclusive', () => {
    expect(isMemberDuring(m('20260101', '20260930'), '20260801', '20270731')).toBe(true); // left mid-course
    expect(isMemberDuring(m('20270801', '99991231'), '20260801', '20270731')).toBe(false); // joined after the end
    expect(isMemberDuring({ ...m('20260101', '99991231'), orgModelType: 'org' }, '20260801', '20270731')).toBe(false);
  });

  it('counts the boundary days', () => {
    expect(isMemberDuring(m('20270731', '99991231'), '20260801', '20270731')).toBe(true); // joined on the last day
    expect(isMemberDuring(m('20200101', '20260801'), '20260801', '20270731')).toBe(true); // left on the first day
    expect(isMemberDuring(m('20200101', '20260731'), '20260801', '20270731')).toBe(false); // left the day before
  });

  it('treats empty dates as open ended and ignores archived memberships', () => {
    expect(isMemberDuring(m('', ''), '20260801', '20270731')).toBe(true);
    expect(isMemberDuring({ ...m('20200101', '99991231'), isArchived: true }, '20260801', '20270731')).toBe(false);
  });

  it('only people are rows', () => {
    expect(isMemberDuring({ ...m('20200101', '99991231'), memberModelType: 'org' }, '20260801', '20270731')).toBe(false);
  });
});

describe('courseRowPersons', () => {
  it('members in period + attendees + attendance guests, trainers first, then lastName', () => {
    const c = course({ trainers: [avatar('pT', 'Tina', 'Trainer')] });
    const memberA = m('20200101', '99991231', 'pA', 'Aebi');
    const memberZ = m('20200101', '99991231', 'pZ', 'Zürcher');
    const guestEvent = ev([], { attendance: { pG: entry('pG', 'present') } });
    guestEvent.attendance['pG'].person = avatar('pG', 'Gast', 'Gerber');
    const rows = courseRowPersons(c, [memberZ, memberA], [guestEvent]);
    expect(rows.map(r => r.key)).toEqual(['pT', 'pA', 'pG', 'pZ']);
    expect(rows[0].isTrainer).toBe(true);
    expect(rows[1]).toEqual({ key: 'pA', name1: 'VorpA', name2: 'Aebi', isTrainer: false });
    expect(rows[2]).toEqual({ key: 'pG', name1: 'Gast', name2: 'Gerber', isTrainer: false });
  });

  it('adds a guest who only signed up', () => {
    const e = ev([{ key: 'pS', state: 'accepted' }]);
    expect(courseRowPersons(course(), [], [e]).map(r => r.key)).toEqual(['pS']);
  });

  it('skips members outside the period', () => {
    const gone = m('20200101', '20260731', 'pOld');
    const later = m('20270801', '99991231', 'pNew');
    const here = m('20260901', '99991231', 'pHere');
    expect(courseRowPersons(course(), [gone, later, here], []).map(r => r.key)).toEqual(['pHere']);
  });

  it('lists a person once, trainer wins over member and attendee', () => {
    const c = course({ trainers: [avatar('p1', 'Tina', 'Trainer')] });
    const rows = courseRowPersons(c, [m('20200101', '99991231', 'p1', 'Member')], [ev([{ key: 'p1', state: 'accepted' }])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'p1', name2: 'Trainer', isTrainer: true });
  });

  it('ignores people who only appear on cancelled or archived events', () => {
    const cancelled = ev([{ key: 'pX', state: 'accepted' }], { state: 'cancelled' });
    const archived = ev([{ key: 'pY', state: 'accepted' }], { isArchived: true });
    expect(courseRowPersons(course(), [], [cancelled, archived])).toEqual([]);
  });

  it('survives legacy events without attendees or attendance', () => {
    const legacy = ev() as Partial<CalEventModel> as CalEventModel;
    (legacy as { attendees?: Attendee[] }).attendees = undefined;
    (legacy as { attendance?: Record<string, AttendanceEntry> }).attendance = undefined;
    expect(courseRowPersons(course(), [], [legacy])).toEqual([]);
  });

  it('orders ties on lastName by firstName', () => {
    const b = m('20200101', '99991231', 'pB', 'Meier');
    b.memberName1 = 'Berta';
    const a = m('20200101', '99991231', 'pA', 'Meier');
    a.memberName1 = 'Anna';
    expect(courseRowPersons(course(), [b, a], []).map(r => r.key)).toEqual(['pA', 'pB']);
  });
});

describe('prefillAttendance', () => {
  it('maps sign-up to presence', () => {
    expect(prefillAttendance(ev([{ key: 'p1', state: 'accepted' }]), 'p1', [])).toEqual({ presence: 'present', function: 'participant' });
    expect(prefillAttendance(ev([{ key: 'p1', state: 'declined' }]), 'p1', [])).toEqual({ presence: 'excused', function: 'participant' });
    expect(prefillAttendance(ev([]), 'p1', ['p1'])).toEqual({ presence: 'absent', function: 'leader' });
  });

  it('an unanswered invitation counts as no answer', () => {
    expect(prefillAttendance(ev([{ key: 'p1', state: 'invited' }]), 'p1', [])).toEqual({ presence: 'absent', function: 'participant' });
  });

  it('a trainer who signed up is present as leader', () => {
    expect(prefillAttendance(ev([{ key: 'pT', state: 'accepted' }]), 'pT', ['pT'])).toEqual({ presence: 'present', function: 'leader' });
  });
});

describe('courseEventStarted', () => {
  it('compares the date, and on the day itself the time when a time is given', () => {
    const e = ev([], { startDate: '20261101', startTime: '19:00' });
    expect(courseEventStarted(e, '20261031')).toBe(false);
    expect(courseEventStarted(e, '20261102')).toBe(true);
    expect(courseEventStarted(e, '20261101')).toBe(true); // day granularity without a time
    expect(courseEventStarted(e, '20261101', '18:59')).toBe(false);
    expect(courseEventStarted(e, '20261101', '19:00')).toBe(true);
  });

  it('a full-day event (no time) starts with its day', () => {
    expect(courseEventStarted(ev([], { startDate: '20261101', startTime: '' }), '20261101', '00:00')).toBe(true);
  });
});

describe('buildCourseTable', () => {
  it('lists group events in the period without courseKey as unassigned', () => {
    const assigned = ev([], { okey: 'a', courseKey: 'c1' });
    const unassignedInPeriod = ev([], { okey: 'u1', startDate: '20261020' });
    const unassignedOutside = ev([], { okey: 'u2', startDate: '20280101' });
    const t = buildCourseTable(course(), [assigned], [assigned, unassignedInPeriod, unassignedOutside], [], TODAY);
    expect(t.unassigned.map(u => u.event.okey)).toEqual(['u1']);
    expect(t.unassigned[0].suggested).toBe(true); // typeMapping = { training: 'Training' }, event.type 'training'
  });

  it('does not suggest a type that is not mapped, and skips cancelled, archived and foreign-course events', () => {
    const other = ev([], { okey: 'other', type: 'meeting' });
    const foreign = ev([], { okey: 'foreign', courseKey: 'c2' });
    const cancelled = ev([], { okey: 'canc', state: 'cancelled' });
    const archived = ev([], { okey: 'arch', isArchived: true });
    const t = buildCourseTable(course(), [], [foreign, cancelled, archived, other], [], TODAY);
    expect(t.unassigned.map(u => [u.event.okey, u.suggested])).toEqual([['other', false]]);
  });

  it('period edges are inclusive and a legacy course without typeMapping suggests nothing', () => {
    const first = ev([], { okey: 'first', startDate: '20260801' });
    const last = ev([], { okey: 'last', startDate: '20270731' });
    const c = course();
    (c as { typeMapping?: Record<string, string> }).typeMapping = undefined;
    const t = buildCourseTable(c, [], [last, first], [], TODAY);
    expect(t.unassigned.map(u => [u.event.okey, u.suggested])).toEqual([['first', false], ['last', false]]);
  });

  it('treats a legacy event without courseKey as unassigned', () => {
    const legacy = ev([], { okey: 'legacy' });
    (legacy as { courseKey?: string }).courseKey = undefined;
    expect(buildCourseTable(course(), [], [legacy], [], TODAY).unassigned.map(u => u.event.okey)).toEqual(['legacy']);
  });

  it('builds columns, rows and one cell per person and event', () => {
    const e1 = ev([{ key: 'p1', state: 'accepted' }], { okey: 'e1', startDate: '20261001', courseKey: 'c1' });
    const e2 = ev([{ key: 'p1', state: 'declined' }], { okey: 'e2', startDate: '20261008', courseKey: 'c1' });
    const t = buildCourseTable(course(), [e2, e1], [], [m('20200101', '99991231', 'p1'), m('20200101', '99991231', 'p2', 'Zed')], TODAY);
    expect(t.columns.map(c => c.okey)).toEqual(['e1', 'e2']);
    expect(t.rows.map(r => r.key)).toEqual(['p1', 'p2']);
    expect(Object.keys(t.cells)).toEqual(['p1', 'p2']);
    expect(Object.keys(t.cells['p2'])).toEqual(['e1', 'e2']);
    expect(t.cells['p1']['e1'].signUp).toBe('accepted');
    expect(t.cells['p1']['e2'].signUp).toBe('declined');
    expect(t.cells['p2']['e1'].signUp).toBeUndefined();
  });

  it('prefills only from event start on; a stored entry wins', () => {
    const past = ev([{ key: 'p1', state: 'accepted' }], { okey: 'past', startDate: '20261001', courseKey: 'c1' });
    const future = ev([{ key: 'p1', state: 'accepted' }], { okey: 'future', startDate: '20261201', courseKey: 'c1' });
    const stored = ev([{ key: 'p1', state: 'accepted' }], {
      okey: 'stored',
      startDate: '20261002',
      courseKey: 'c1',
      attendance: { p1: entry('p1', 'absent') },
    });
    const c = course({ trainers: [avatar('pT')] });
    const t = buildCourseTable(c, [past, future, stored], [], [m('20200101', '99991231', 'p1')], TODAY);
    expect(t.cells['p1']['past'].prefill).toEqual({ presence: 'present', function: 'participant' });
    expect(t.cells['p1']['past'].entry).toBeUndefined();
    expect(t.cells['p1']['future'].prefill).toBeUndefined();
    expect(t.cells['p1']['future'].signUp).toBe('accepted');
    expect(t.cells['p1']['stored'].entry?.presence).toBe('absent');
    expect(t.cells['p1']['stored'].prefill).toBeUndefined();
    // the trainer gets leader as the function default
    expect(t.cells['pT']['past'].prefill).toEqual({ presence: 'absent', function: 'leader' });
  });

  it('an event today is prefilled by date, or by time when the clock is given', () => {
    const today = ev([], { okey: 'today', startDate: TODAY, startTime: '19:00', courseKey: 'c1' });
    const c = course();
    const members = [m('20200101', '99991231', 'p1')];
    expect(buildCourseTable(c, [today], [], members, TODAY).cells['p1']['today'].prefill).toBeDefined();
    expect(buildCourseTable(c, [today], [], members, TODAY, '18:00').cells['p1']['today'].prefill).toBeUndefined();
    expect(buildCourseTable(c, [today], [], members, TODAY, '19:30').cells['p1']['today'].prefill).toBeDefined();
  });

  it('excludes cancelled and archived events from the columns', () => {
    const ok = ev([], { okey: 'ok', courseKey: 'c1' });
    const cancelled = ev([], { okey: 'canc', courseKey: 'c1', state: 'cancelled' });
    const t = buildCourseTable(course(), [ok, cancelled], [], [], TODAY);
    expect(t.columns.map(c => c.okey)).toEqual(['ok']);
  });

  it('survives legacy events without attendance', () => {
    const legacy = ev([{ key: 'p1', state: 'accepted' }], { okey: 'legacy', courseKey: 'c1' });
    (legacy as { attendance?: Record<string, AttendanceEntry> }).attendance = undefined;
    const t = buildCourseTable(course(), [legacy], [], [], TODAY);
    expect(t.cells['p1']['legacy'].entry).toBeUndefined();
    expect(t.cells['p1']['legacy'].prefill).toEqual({ presence: 'present', function: 'participant' });
  });
});

describe('unconfirmedPastEvents', () => {
  it('ignores future, cancelled, archived and confirmed events', () => {
    const past = ev([], { okey: 'past', startDate: '20261001' });
    const confirmed = ev([], { okey: 'conf', startDate: '20261002', attendanceConfirmedAt: '20261003100000' });
    const future = ev([], { okey: 'future', startDate: '20261201' });
    const cancelled = ev([], { okey: 'canc', startDate: '20261004', state: 'cancelled' });
    const archived = ev([], { okey: 'arch', startDate: '20261005', isArchived: true });
    expect(unconfirmedPastEvents([future, cancelled, archived, confirmed, past], TODAY).map(e => e.okey)).toEqual(['past']);
  });

  it('is sorted and treats a legacy event without attendanceConfirmedAt as unconfirmed', () => {
    const b = ev([], { okey: 'b', startDate: '20261010' });
    const a = ev([], { okey: 'a', startDate: '20261001' });
    (a as { attendanceConfirmedAt?: string }).attendanceConfirmedAt = undefined;
    expect(unconfirmedPastEvents([b, a], TODAY).map(e => e.okey)).toEqual(['a', 'b']);
  });

  it('an event later today is not past when the clock is given', () => {
    const tonight = ev([], { okey: 'tonight', startDate: TODAY, startTime: '20:00' });
    expect(unconfirmedPastEvents([tonight], TODAY, '12:00')).toEqual([]);
    expect(unconfirmedPastEvents([tonight], TODAY, '20:00').map(e => e.okey)).toEqual(['tonight']);
  });
});
