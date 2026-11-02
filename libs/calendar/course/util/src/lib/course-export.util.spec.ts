import { describe, expect, it } from 'vitest';

import { AttendanceEntry, AvatarInfo, CalEventModel, CourseFinanceModel, CourseModel, JsReportSettings, MoneyModel } from '@okr/shared-models';

import { computeCompensation } from './course-compensation.util';
import { buildGenericCsvRows, buildJsAwkRows, DEFAULT_JS_TYPE_MAPPING, JS_AWK_HEADER } from './course-export.util';
import { allowedJsDurations } from './js-durations';
import { buildCourseTable } from './course-table.util';

const settings: JsReportSettings = { courseNumber: '123', userGroup: '1', mainSportCategory: 'abs1' };

function avatar(key: string, name1 = key, name2 = key): AvatarInfo {
  return { key, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

function entry(key: string, presence: AttendanceEntry['presence'], fn: AttendanceEntry['function'], name2 = key): AttendanceEntry {
  return { person: avatar(key, 'Vor' + key, name2), presence, function: fn, by: 'pT', at: '20261105200000' };
}

const present = (key: string, fn: AttendanceEntry['function'], name2 = key): [string, AttendanceEntry] => [key, entry(key, 'present', fn, name2)];
const absent = (key: string): [string, AttendanceEntry] => [key, entry(key, 'absent', 'participant')];

function training(
  okey: string,
  date: string,
  time: string,
  minutes: number,
  location: string,
  attendance: [string, AttendanceEntry][],
  over: Partial<CalEventModel> = {},
): CalEventModel {
  const e = new CalEventModel('scs');
  e.okey = okey;
  e.type = 'training';
  e.startDate = date;
  e.startTime = time;
  e.durationMinutes = minutes;
  e.locationKey = location;
  e.attendance = Object.fromEntries(attendance);
  e.attendanceConfirmedAt = '20261105210000';
  return Object.assign(e, over);
}

function course(over: Partial<CourseModel> = {}): CourseModel {
  return Object.assign(new CourseModel('scs'), { reportProfile: 'js', reportSettings: settings, typeMapping: { ...DEFAULT_JS_TYPE_MAPPING, match: 'Wettkampf', day: 'Trainingstag', camp: 'Lagertag' } }, over);
}

const persons: { key: string; externalIds?: Record<string, string> }[] = [
  { key: 'pA', externalIds: { js: '111111111' } },
  { key: 'pT', externalIds: { js: '222222222' } },
  { key: 'pB', externalIds: { js: '333333333' } },
  { key: 'pN', externalIds: {} as Record<string, string> },
];

describe('buildJsAwkRows', () => {
  it('header and one row per present person and event, trainers first', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [training('e1', '20261105', '18:30', 90, 'Bootshaus@k1', [present('pA', 'participant'), present('pT', 'leader'), absent('pB')])],
      persons,
    );
    expect(rows[0]).toEqual(JS_AWK_HEADER);
    expect(rows.slice(1)).toEqual([
      ['222222222', 'Leiter/in', '05.11.2026', 'Training', '18:30', '90', 'Bootshaus'],
      ['111111111', 'Teilnehmer/in', '05.11.2026', 'Training', '18:30', '90', 'Bootshaus'],
    ]);
    expect(findings).toEqual([]);
  });

  it('orders by event, then leaders before participants, then last name', () => {
    const { rows } = buildJsAwkRows(
      course(),
      [
        training('e2', '20261112', '18:30', 60, 'Halle@k2', [present('pB', 'participant', 'Meier')]),
        training('e1', '20261105', '18:30', 60, 'Halle@k2', [present('pB', 'participant', 'Zeller'), present('pA', 'participant', 'Meier'), present('pT', 'leader', 'Zorn')]),
      ],
      persons,
    );
    expect(rows.slice(1).map(r => [r[2], r[0]])).toEqual([
      ['05.11.2026', '222222222'],
      ['05.11.2026', '111111111'],
      ['05.11.2026', '333333333'],
      ['12.11.2026', '333333333'],
    ]);
  });

  it('Wettkampf has no ZEIT and no ORT', () => {
    const { rows, findings } = buildJsAwkRows(
      course({ reportSettings: { ...settings, userGroup: '2', mainSportCategory: 'abs2' } }),
      [training('e1', '20261107', '09:00', 120, 'Halle@k2', [present('pA', 'participant')], { type: 'match' })],
      persons,
    );
    expect(findings).toEqual([]);
    expect(rows[1]).toEqual(['111111111', 'Teilnehmer/in', '07.11.2026', 'Wettkampf', '', '120', '']);
  });

  it('Wettkampf of NG 1 needs no DAUER, Lagertag allows none', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [
        training('e1', '20261107', '09:00', 120, 'Halle@k2', [present('pA', 'participant')], { type: 'match' }),
        training('e2', '20261108', '09:00', 600, '', [present('pA', 'participant')], { type: 'camp' }),
      ],
      persons,
    );
    expect(findings).toEqual([]);
    expect(rows[1]).toEqual(['111111111', 'Teilnehmer/in', '07.11.2026', 'Wettkampf', '', '', '']);
    expect(rows[2]).toEqual(['111111111', 'Teilnehmer/in', '08.11.2026', 'Lagertag', '', '', '']);
  });

  it('Trainingstag has DAUER but no ZEIT and no ORT', () => {
    const { rows, findings } = buildJsAwkRows(course(), [training('e1', '20261107', '09:00', 240, 'Halle@k2', [present('pA', 'participant')], { type: 'day' })], persons);
    expect(findings).toEqual([]);
    expect(rows[1]).toEqual(['111111111', 'Teilnehmer/in', '07.11.2026', 'Trainingstag', '', '240', '']);
  });

  it('105-minute training → badDuration, rows left out, other events still export', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [
        training('e1', '20261105', '18:30', 105, 'Bootshaus@k1', [present('pA', 'participant')]),
        training('e2', '20261112', '18:30', 90, 'Bootshaus@k1', [present('pA', 'participant')]),
      ],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'badDuration' }]);
    expect(rows.slice(1).map(r => r[2])).toEqual(['12.11.2026']);
  });

  it('full-day training → fullDayTraining finding, rows left out', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [training('e1', '20261105', '', 1440, 'Bootshaus@k1', [present('pA', 'participant')], { fullDay: true })],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'fullDayTraining' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('training without location → missingLocation', () => {
    const { rows, findings } = buildJsAwkRows(course(), [training('e1', '20261105', '18:30', 90, '', [present('pA', 'participant')])], persons);
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'missingLocation' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('person without js number → missingNumber, only that row left out', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [training('e1', '20261105', '18:30', 90, 'Bootshaus@k1', [present('pA', 'participant'), present('pN', 'participant'), present('pX', 'participant')])],
      persons,
    );
    expect(findings).toEqual([
      { caleventKey: 'e1', personKey: 'pN', code: 'missingNumber' },
      { caleventKey: 'e1', personKey: 'pX', code: 'missingNumber' },
    ]);
    expect(rows.slice(1).map(r => r[0])).toEqual(['111111111']);
  });

  it('unconfirmed event → unconfirmed finding, rows left out', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [training('e1', '20261105', '18:30', 90, 'Bootshaus@k1', [present('pA', 'participant')], { attendanceConfirmedAt: '' })],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'unconfirmed' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('type without mapping → unmappedType', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [training('e1', '20261105', '18:30', 90, 'Bootshaus@k1', [present('pA', 'participant')], { type: 'party' })],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'unmappedType' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('NG 4 Wettkampf → notAllowed', () => {
    const { rows, findings } = buildJsAwkRows(
      course({ reportSettings: { ...settings, userGroup: '4' } }),
      [training('e1', '20261107', '09:00', 120, 'Halle@k2', [present('pA', 'participant')], { type: 'match' })],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'notAllowed' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('skips cancelled and archived events and events nobody attended', () => {
    const { rows, findings } = buildJsAwkRows(
      course(),
      [
        training('e1', '20261105', '18:30', 90, 'B@k1', [present('pA', 'participant')], { state: 'cancelled', attendanceConfirmedAt: '' }),
        training('e2', '20261112', '18:30', 105, 'B@k1', [absent('pA')]),
        training('e3', '20261119', '18:30', 90, 'B@k1', [present('pA', 'participant')], { isArchived: true }),
      ],
      persons,
    );
    expect(findings).toEqual([]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('incomplete settings cannot be checked → badDuration instead of unchecked rows', () => {
    const { rows, findings } = buildJsAwkRows(
      course({ reportSettings: { courseNumber: '123' } }),
      [training('e1', '20261105', '18:30', 90, 'B@k1', [present('pA', 'participant')])],
      persons,
    );
    expect(findings).toEqual([{ caleventKey: 'e1', code: 'badDuration' }]);
    expect(rows).toEqual([JS_AWK_HEADER]);
  });

  it('coalesces missing attendance, typeMapping, reportSettings and externalIds on raw documents', () => {
    const raw = { ...new CourseModel('scs'), reportSettings: undefined, typeMapping: undefined } as unknown as CourseModel;
    const ev = training('e1', '20261105', '18:30', 90, 'B@k1', [], { attendance: undefined } as Partial<CalEventModel>);
    expect(() => buildJsAwkRows(raw, [ev], [{ key: 'pA' }])).not.toThrow();
    expect(buildJsAwkRows(raw, [ev], [{ key: 'pA' }]).rows).toEqual([JS_AWK_HEADER]);
  });
});

describe('allowedJsDurations', () => {
  it('NG5 abs1 Training', () => expect(allowedJsDurations({ ...settings, userGroup: '5' }, 'Training')).toEqual([45, 60, 75, 90]));
  it('NG5 abs2 Training', () =>
    expect(allowedJsDurations({ ...settings, userGroup: '5', mainSportCategory: 'abs2' }, 'Training')).toEqual([45, 60, 90, 120, 150, 180, 210, 240, 270, 300]));
  it('NG2 abs2 Training and Wettkampf in 30-minute steps', () => {
    const s: JsReportSettings = { ...settings, userGroup: '2', mainSportCategory: 'abs2' };
    expect(allowedJsDurations(s, 'Training')).toEqual([60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(allowedJsDurations(s, 'Wettkampf')).toEqual([60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });
  it('Trainingstag, Wettkampf and Lagertag', () => {
    expect(allowedJsDurations(settings, 'Trainingstag')).toEqual([240, 300]);
    expect(allowedJsDurations(settings, 'Wettkampf')).toBe('optional');
    expect(allowedJsDurations({ ...settings, userGroup: '4' }, 'Wettkampf')).toBe('none');
    expect(allowedJsDurations(settings, 'Lagertag')).toBe('forbidden');
  });
});

const labels = {
  name: 'Name',
  firstName: 'Vorname',
  function: 'Funktion',
  total: 'Summe',
  present: 'anwesend',
  absent: 'abwesend',
  excused: 'entschuldigt',
  leader: 'Leiter/in',
  participant: 'Teilnehmer/in',
};

describe('buildGenericCsvRows', () => {
  const e1 = training('e1', '20261105', '18:30', 90, 'B@k1', [present('pT', 'leader', 'Zorn'), present('pA', 'participant', 'Meier')]);
  const e2 = training('e2', '20261112', '18:30', 90, 'B@k1', [
    present('pT', 'leader', 'Zorn'),
    ['pA', entry('pA', 'excused', 'participant', 'Meier')],
  ]);
  const e3 = training('e3', '20261119', '18:30', 90, 'B@k1', [present('pT', 'leader', 'Zorn')]);
  const c = Object.assign(new CourseModel('scs'), { trainers: [avatar('pT', 'VorpT', 'Zorn')], startDate: '20261101', endDate: '20261231' });
  const table = buildCourseTable(c, [e3, e1, e2], [], [], '20261101');

  it('one row per person, one column per event, totals', () => {
    const rows = buildGenericCsvRows(table, labels);
    expect(rows[0]).toEqual(['Name', 'Vorname', 'Funktion', '05.11.2026 18:30', '12.11.2026 18:30', '19.11.2026 18:30', 'Summe']);
    expect(rows.slice(1)).toEqual([
      ['Zorn', 'VorpT', 'Leiter/in', 'anwesend', 'anwesend', 'anwesend', '3'],
      ['Meier', 'VorpA', 'Teilnehmer/in', 'anwesend', 'entschuldigt', '', '1'],
    ]);
  });

  it('writes only stored entries, never the prefill', () => {
    const t = buildCourseTable(c, [training('e1', '20261105', '18:30', 90, 'B@k1', [])], [], [], '20261201');
    const rows = buildGenericCsvRows(t, labels);
    expect(rows[1].slice(3)).toEqual(['', '0']);
  });

  it('compensation columns only when passed', () => {
    const finance = Object.assign(new CourseFinanceModel(), { defaultRate: new MoneyModel(5000), eligible: [{ person: avatar('pT') }] });
    const lines = computeCompensation([e1, e2, e3], finance);
    const rows = buildGenericCsvRows(table, labels, lines);
    expect(rows[0].slice(7)).toEqual(['ledCount', 'rate', 'amount']);
    expect(rows[1].slice(7)).toEqual(['3', '50.00', '150.00']);
    expect(rows[2].slice(7)).toEqual(['', '', '']);
    expect(buildGenericCsvRows(table, labels)[0]).toHaveLength(7);
  });
});
