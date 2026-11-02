import { AttendanceEntry, CalEventModel, CourseModel, JsReportSettings } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getExternalId } from '@okr/shared-util-core';

import { CompensationLine } from './course-compensation.util';
import { CourseTable, courseEvents } from './course-table.util';
import { allowedJsDurations, JsActivityType } from './js-durations';

/** Header line of the J+S attendance import (AWK); the columns must neither be removed nor reordered (spec 1.132 §9.2). */
export const JS_AWK_HEADER = ['PERSONENNUMMER', 'FUNKTION', 'DATUM', 'AKTIVITAETSTYP', 'ZEIT', 'DAUER', 'ORT'];

/** `calevent.type` → J+S activity type that every course starts with; tenant types are added in the course form. */
export const DEFAULT_JS_TYPE_MAPPING: Record<string, JsActivityType> = { training: 'Training' };

const JS_ACTIVITY_TYPES: string[] = ['Training', 'Wettkampf', 'Trainingstag', 'Lagertag'];

/** A problem that keeps rows out of the export; the rest still exports (spec 1.132 §9.3). */
export type ExportFinding = {
  caleventKey?: string;
  personKey?: string;
  code: 'missingNumber' | 'unmappedType' | 'unconfirmed' | 'badDuration' | 'missingLocation' | 'fullDayTraining' | 'notAllowed';
};

const JS_FUNCTION: Record<AttendanceEntry['function'], string> = { leader: 'Leiter/in', participant: 'Teilnehmer/in' };

function isJsActivityType(value: string | undefined): value is JsActivityType {
  return value !== undefined && JS_ACTIVITY_TYPES.indexOf(value) >= 0;
}

function isCompleteSettings(s: Partial<JsReportSettings>): s is JsReportSettings {
  return ['1', '2', '4', '5'].indexOf(s.userGroup ?? '') >= 0 && (s.mainSportCategory === 'abs1' || s.mainSportCategory === 'abs2');
}

/** The location name of a `name@key` location key; '' when there is none. */
function locationName(locationKey: string | undefined): string {
  return (locationKey ?? '').split('@')[0];
}

function byLeaderThenName(a: AttendanceEntry, b: AttendanceEntry): number {
  return (
    Number(b.function === 'leader') - Number(a.function === 'leader') ||
    a.person.name2.localeCompare(b.person.name2, 'de') ||
    a.person.name1.localeCompare(b.person.name1, 'de')
  );
}

/**
 * Checks one event against the J+S rules and returns its findings plus the `DAUER` to write. An event with findings
 * is left out as a whole. Settings that are not complete cannot be checked and count as `badDuration`
 * (fail safe: no unchecked rows leave the app).
 */
function checkJsEvent(
  event: CalEventModel,
  activityType: JsActivityType | undefined,
  settings: Partial<JsReportSettings>,
): { findings: ExportFinding['code'][]; duration: string } {
  const findings: ExportFinding['code'][] = [];
  if (!activityType) return { findings: ['unmappedType'], duration: '' };

  let duration = '';
  if (activityType === 'Training') {
    if (event.fullDay || !event.startTime) findings.push('fullDayTraining'); // ZEIT is required
    if (!locationName(event.locationKey)) findings.push('missingLocation');
  }

  if (!(activityType === 'Training' && findings.indexOf('fullDayTraining') >= 0)) {
    if (!isCompleteSettings(settings)) {
      findings.push('badDuration');
    } else {
      const allowed = allowedJsDurations(settings, activityType);
      if (allowed === 'none') findings.push('notAllowed');
      else if (Array.isArray(allowed)) {
        if (allowed.indexOf(event.durationMinutes) < 0) findings.push('badDuration');
        else duration = String(event.durationMinutes);
      }
    }
  }
  return { findings, duration };
}

/**
 * The J+S AWK import file (spec 1.132 §9.2) as rows, header first: one row per present person and confirmed event.
 * Events and persons with problems become findings and are left out; everything else still exports.
 * Order: event order, then leaders before participants, then last and first name. ZEIT and ORT only for `Training`;
 * DAUER stays empty where J+S wants no entry. The caller writes the file (BOM, `;`) with `exportCsv`.
 */
export function buildJsAwkRows(
  course: CourseModel,
  events: CalEventModel[],
  persons: { key: string; externalIds?: Record<string, string> }[],
): { rows: string[][]; findings: ExportFinding[] } {
  const rows: string[][] = [JS_AWK_HEADER];
  const findings: ExportFinding[] = [];
  const typeMapping = course.typeMapping ?? {};
  const settings = course.reportSettings ?? {};
  const personByKey = new Map(persons.map(p => [p.key, p] as const));

  for (const event of courseEvents(events)) {
    if (!event.attendanceConfirmedAt) {
      findings.push({ caleventKey: event.okey, code: 'unconfirmed' });
      continue;
    }
    const present = Object.values(event.attendance ?? {})
      .filter(a => a.presence === 'present')
      .sort(byLeaderThenName);
    if (present.length === 0) continue;

    const mapped = typeMapping[event.type];
    const activityType = isJsActivityType(mapped) ? mapped : undefined;
    const check = checkJsEvent(event, activityType, settings);
    if (check.findings.length > 0 || !activityType) {
      for (const code of check.findings) findings.push({ caleventKey: event.okey, code });
      continue;
    }

    const isTraining = activityType === 'Training';
    const date = convertDateFormatToString(event.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    for (const entry of present) {
      const number = getExternalId(personByKey.get(entry.person.key), 'js');
      if (!number) {
        findings.push({ caleventKey: event.okey, personKey: entry.person.key, code: 'missingNumber' });
        continue;
      }
      rows.push([
        number,
        JS_FUNCTION[entry.function],
        date,
        activityType,
        isTraining ? event.startTime : '',
        check.duration,
        isTraining ? locationName(event.locationKey) : '',
      ]);
    }
  }
  return { rows, findings };
}

/** Column titles of the generic CSV in the user's language; the compensation titles are only used when compensation is passed. */
export type GenericCsvLabels = {
  name: string;
  firstName: string;
  function: string;
  total: string;
  present: string;
  absent: string;
  excused: string;
  leader: string;
  participant: string;
  ledCount?: string;
  rate?: string;
  amount?: string;
};

function eventTitle(event: CalEventModel): string {
  const date = convertDateFormatToString(event.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  return event.fullDay || !event.startTime ? date : `${date} ${event.startTime}`;
}

function formatMinor(amount: number): string {
  return (amount / 100).toFixed(2);
}

/** The function a person had in most of their stored entries; equal or none → leader for trainers, else participant. */
function predominantFunction(entries: AttendanceEntry[], isTrainer: boolean): AttendanceEntry['function'] {
  const leaders = entries.filter(e => e.function === 'leader').length;
  const participants = entries.length - leaders;
  if (leaders === participants) return isTrainer ? 'leader' : 'participant';
  return leaders > participants ? 'leader' : 'participant';
}

/**
 * The generic CSV (§9.1) as rows, header first: one row per person of the table, one column per event, the number of
 * `present` at the end. Only stored attendance is written, never the prefill. With `compensation` three columns
 * (led trainings, rate, amount in CHF-style decimals) are appended; persons without a line get empty cells.
 */
export function buildGenericCsvRows(table: CourseTable, labels: GenericCsvLabels, compensation?: CompensationLine[]): string[][] {
  const presenceLabel: Record<AttendanceEntry['presence'], string> = { present: labels.present, absent: labels.absent, excused: labels.excused };
  const header = [labels.name, labels.firstName, labels.function, ...table.columns.map(eventTitle), labels.total];
  if (compensation) header.push(labels.ledCount ?? 'ledCount', labels.rate ?? 'rate', labels.amount ?? 'amount');
  const lineByKey = new Map((compensation ?? []).map(l => [l.person.key, l] as const));

  const rows = table.rows.map(row => {
    const entries = table.columns
      .map(event => table.cells[row.key]?.[event.okey]?.entry)
      .filter((e): e is AttendanceEntry => e !== undefined);
    const fn = predominantFunction(entries, row.isTrainer);
    const cells = table.columns.map(event => {
      const entry = table.cells[row.key]?.[event.okey]?.entry;
      return entry ? presenceLabel[entry.presence] : '';
    });
    const out = [row.name2, row.name1, fn === 'leader' ? labels.leader : labels.participant, ...cells, String(entries.filter(e => e.presence === 'present').length)];
    if (compensation) {
      const line = lineByKey.get(row.key);
      out.push(...(line ? [String(line.ledCount), formatMinor(line.rate.amount), formatMinor(line.amount)] : ['', '', '']));
    }
    return out;
  });
  return [header, ...rows];
}
