import { describe, expect, it } from 'vitest';

import { AttendanceEntry, Attendee, AvatarInfo, CalEventModel, CourseModel } from '@okr/shared-models';

import { ExportFinding } from './course-export.util';
import { buildCourseTable } from './course-table.util';
import {
  AttendanceRow, attendanceEntriesToWrite, attendanceRowsForEvent, courseEventLabel, courseFileBase, isPlainPersonKey, missingNumberKeys,
  presentCounts, visibleFindings
} from './course-table-view.util';
import { courseAttendanceValidations } from './course.validations';

const TODAY = '20261101';

function avatar(key: string, name1 = 'Vor' + key, name2 = 'Nach' + key): AvatarInfo {
  return { key, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

function ev(okey: string, startDate: string, attendees: { key: string; state: Attendee['state'] }[] = [], over: Partial<CalEventModel> = {}): CalEventModel {
  const e = new CalEventModel('scs');
  e.okey = okey;
  e.startDate = startDate;
  e.startTime = '19:00';
  e.type = 'training';
  e.attendees = attendees.map(a => ({ person: avatar(a.key), state: a.state }));
  return Object.assign(e, over);
}

function entry(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function'] = 'participant'): AttendanceEntry {
  return { person: avatar(key), presence, function: fn, by: 'pT', at: '20261016120000' };
}

function course(): CourseModel {
  const c = new CourseModel('scs');
  c.okey = 'c1';
  c.groupKey = 'g1';
  c.startDate = '20260801';
  c.endDate = '20270731';
  c.trainers = [avatar('pT')];
  return c;
}

function row(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function'] = 'participant', stored?: Pick<AttendanceEntry, 'presence' | 'function'>): AttendanceRow {
  return { person: avatar(key), isTrainer: false, presence, function: fn, ...(stored ? { stored } : {}) };
}

describe('isPlainPersonKey', () => {
  it('accepts letters, digits and underscores only', () => {
    expect(isPlainPersonKey('p1_Ab')).toBe(true);
    for (const bad of ['', 'a.b', 'a/b', 'a b', 'ä', undefined, null]) expect(isPlainPersonKey(bad as string)).toBe(false);
  });
});

describe('attendanceRowsForEvent', () => {
  it('takes the stored entry, else the prefill from the sign-up, in table order with the sign-up', () => {
    const past = ev('e1', '20261020', [{ key: 'pA', state: 'accepted' }, { key: 'pB', state: 'declined' }], {
      attendance: { pB: entry('pB', 'present', 'leader') },
    });
    const table = buildCourseTable(course(), [past], [], [], TODAY);
    const rows = attendanceRowsForEvent(table, past, ['pT']);
    expect(rows.map(r => r.person.key)).toEqual(['pT', 'pA', 'pB']);
    expect(rows[0]).toMatchObject({ presence: 'absent', function: 'leader', isTrainer: true, initial: { presence: 'absent', function: 'leader' } });
    expect(rows[0].stored).toBeUndefined();
    expect(rows[1]).toMatchObject({ presence: 'present', function: 'participant', signUp: 'accepted' });
    expect(rows[2]).toMatchObject({ presence: 'present', function: 'leader', signUp: 'declined', stored: { presence: 'present', function: 'leader' } });
  });

  it('falls back to the prefill rule for an event that has not begun (no prefill in the table)', () => {
    const future = ev('e2', '20261201', [{ key: 'pA', state: 'accepted' }]);
    const table = buildCourseTable(course(), [future], [], [], TODAY);
    const rows = attendanceRowsForEvent(table, future, ['pT']);
    expect(rows.find(r => r.person.key === 'pA')).toMatchObject({ presence: 'present', function: 'participant' });
  });
});

describe('attendanceEntriesToWrite', () => {
  type PF = Pick<AttendanceEntry, 'presence' | 'function'>;
  const opened = (r: AttendanceRow, initial: PF): AttendanceRow => ({ ...r, initial });

  it('writes every row when nothing is stored yet (first confirmation), with by/at', () => {
    const entries = attendanceEntriesToWrite([row('pA', 'present'), row('pB', 'absent')], 'pT', '20261101190000', {});
    expect(entries.map(e => e.person.key)).toEqual(['pA', 'pB']);
    expect(entries[0]).toMatchObject({ presence: 'present', function: 'participant', by: 'pT', at: '20261101190000' });
    expect(attendanceEntriesToWrite([row('pA', 'present')], 'pT', 'now', undefined)).toHaveLength(1);
  });

  it('drops empty and non-plain keys and writes a person only once (first wins)', () => {
    const rows = [row('pA', 'present'), row('', 'present'), row('a.b', 'present'), row('x/y', 'absent'), row('pA', 'absent')];
    const entries = attendanceEntriesToWrite(rows, 'pT', 'now', {});
    expect(entries.map(e => [e.person.key, e.presence])).toEqual([['pA', 'present']]);
  });

  it('against the live entries: skips equal rows, writes user changes and persons without an entry', () => {
    const live: Record<string, PF> = {
      pA: { presence: 'present', function: 'participant' },
      pB: { presence: 'absent', function: 'participant' },
      pC: { presence: 'present', function: 'participant' },
    };
    const rows = [
      opened(row('pA', 'present'), live['pA']),               // unchanged
      opened(row('pB', 'excused'), live['pB']),               // presence corrected by the user
      opened(row('pC', 'present', 'leader'), live['pC']),     // function corrected by the user
      opened(row('pD', 'absent'), { presence: 'absent', function: 'participant' }),   // no live entry
    ];
    expect(attendanceEntriesToWrite(rows, 'pT', 'now', live).map(e => e.person.key)).toEqual(['pB', 'pC', 'pD']);
  });

  it('keeps what somebody else stored while the dialog was open, unless the user changed that row', () => {
    // the dialog opened on the prefill (nothing stored); meanwhile another trainer confirmed pA excused, pB present
    const live: Record<string, PF> = {
      pA: { presence: 'excused', function: 'participant' },
      pB: { presence: 'present', function: 'participant' },
    };
    const rows = [
      opened(row('pA', 'present'), { presence: 'present', function: 'participant' }),   // left alone → theirs stays
      opened(row('pB', 'absent'), { presence: 'present', function: 'participant' }),    // changed by the user → written
    ];
    const entries = attendanceEntriesToWrite(rows, 'pT', 'now', live);
    expect(entries.map(e => [e.person.key, e.presence])).toEqual([['pB', 'absent']]);
  });

  it('a row without `initial` that differs from the live entry counts as a change', () => {
    const live: Record<string, PF> = { pA: { presence: 'absent', function: 'participant' } };
    expect(attendanceEntriesToWrite([row('pA', 'present')], 'pT', 'now', live)).toHaveLength(1);
  });

  it('copies the person, so the written entry does not share the row object', () => {
    const r = row('pA', 'present');
    const [written] = attendanceEntriesToWrite([r], 'pT', 'now', {});
    expect(written.person).toEqual(r.person);
    expect(written.person).not.toBe(r.person);
  });
});

describe('visibleFindings', () => {
  const past = ev('past', '20261020');
  const future = ev('future', '20261201');
  const findings: ExportFinding[] = [
    { code: 'incompleteSettings' },
    { code: 'unconfirmed', caleventKey: 'past' },
    { code: 'unconfirmed', caleventKey: 'future' },
    { code: 'unconfirmed', caleventKey: 'gone' },
    { code: 'missingNumber', caleventKey: 'past', personKey: 'pA' },
  ];

  it('turns incompleteSettings into a flag and keeps unconfirmed only for events that have begun', () => {
    const result = visibleFindings(findings, [past, future], TODAY);
    expect(result.incompleteSettings).toBe(true);
    expect(result.findings).toEqual([{ code: 'unconfirmed', caleventKey: 'past' }, { code: 'missingNumber', caleventKey: 'past', personKey: 'pA' }]);
  });

  it('an event later today has not begun yet with the time given', () => {
    const today = ev('today', TODAY, [], { startTime: '20:00' });
    expect(visibleFindings([{ code: 'unconfirmed', caleventKey: 'today' }], [today], TODAY, '18:00').findings).toEqual([]);
    expect(visibleFindings([{ code: 'unconfirmed', caleventKey: 'today' }], [today], TODAY, '20:00').findings).toHaveLength(1);
  });

  it('without incompleteSettings the flag is false', () => {
    expect(visibleFindings([], [], TODAY)).toEqual({ incompleteSettings: false, findings: [] });
  });
});

describe('missingNumberKeys', () => {
  it('lists each person without a number once, in order of appearance', () => {
    const findings: ExportFinding[] = [
      { code: 'missingNumber', personKey: 'pB', caleventKey: 'e1' },
      { code: 'badDuration', caleventKey: 'e1' },
      { code: 'missingNumber', personKey: 'pA', caleventKey: 'e1' },
      { code: 'missingNumber', personKey: 'pB', caleventKey: 'e2' },
    ];
    expect(missingNumberKeys(findings)).toEqual(['pB', 'pA']);
  });
});

describe('presentCounts', () => {
  it('counts stored present entries per event and per person, never the prefill', () => {
    const e1 = ev('e1', '20261010', [{ key: 'pA', state: 'accepted' }], { attendance: { pA: entry('pA', 'present'), pT: entry('pT', 'present', 'leader') } });
    const e2 = ev('e2', '20261020', [{ key: 'pA', state: 'accepted' }]);   // past, not confirmed: prefill only
    const e3 = ev('e3', '20261025', [], { attendance: { pA: entry('pA', 'excused') } });
    const table = buildCourseTable(course(), [e1, e2, e3], [], [], TODAY);
    expect(presentCounts(table)).toEqual({ perEvent: { e1: 2, e2: 0, e3: 0 }, perPerson: { pT: 1, pA: 1 } });
  });
});

describe('courseEventLabel', () => {
  it('formats the wall-clock date and time without an instant', () => {
    expect(courseEventLabel({ startDate: '20261103', startTime: '18:00', fullDay: false })).toBe('03.11.2026 18:00');
    expect(courseEventLabel({ startDate: '20261103', startTime: '18:00', fullDay: true })).toBe('03.11.2026');
    expect(courseEventLabel({ startDate: '20261103', startTime: '', fullDay: false })).toBe('03.11.2026');
  });
});

describe('courseFileBase', () => {
  it('replaces characters a file name cannot hold and falls back when nothing is left', () => {
    expect(courseFileBase('Kunstturnen U14 / Herbst', 'kurs')).toBe('Kunstturnen_U14_Herbst');
    expect(courseFileBase('  123456  ', 'js')).toBe('123456');
    expect(courseFileBase('Über:Grösse?', 'kurs')).toBe('Über_Grösse');
    expect(courseFileBase('///', 'kurs')).toBe('kurs');
    expect(courseFileBase(undefined, 'js')).toBe('js');
  });
});

describe('courseAttendanceValidations', () => {
  it('accepts rows with a person, a known presence and a known function', () => {
    expect(courseAttendanceValidations({ rows: [row('pA', 'present'), row('pB', 'excused', 'leader')] }).isValid()).toBe(true);
    expect(courseAttendanceValidations({ rows: [] }).isValid()).toBe(true);
  });

  it('rejects a row with an unknown value or without a person', () => {
    const broken = { ...row('pA', 'present'), presence: 'maybe' } as unknown as AttendanceRow;
    const noPerson = { ...row('', 'present') };
    expect(courseAttendanceValidations({ rows: [broken] }).getErrors('rows')).toEqual(['@calendar/course/feature.validation.attendanceInvalid']);
    expect(courseAttendanceValidations({ rows: [noPerson] }).isValid()).toBe(false);
  });
});
