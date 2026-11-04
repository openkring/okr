import { AttendanceEntry, CalEventModel, CourseModel, JsReportSettings } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getEventLocationName, getExternalId } from '@okr/shared-util-core';

import { CompensationLine } from './course-compensation.util';
import { CourseTable, courseEvents } from './course-table.util';
import { allowedJsDurations, isCompleteJsSettings, JsActivityType } from './js-durations';

/** Header line of the J+S attendance import (AWK); the columns must neither be removed nor reordered (spec 1.132 §9.2). */
export const JS_AWK_HEADER = ['PERSONENNUMMER', 'FUNKTION', 'DATUM', 'AKTIVITAETSTYP', 'ZEIT', 'DAUER', 'ORT'];

/** `calevent.type` → J+S activity type that every course starts with; tenant types are added in the course form. */
export const DEFAULT_JS_TYPE_MAPPING: Record<string, JsActivityType> = { training: 'Training' };

/** The activity types the AWK knows, in the order the course form offers them. */
export const JS_ACTIVITY_TYPES: string[] = ['Training', 'Wettkampf', 'Trainingstag', 'Lagertag'];

/** A problem that keeps rows out of the export; the rest still exports (spec 1.132 §9.3). */
export type ExportFinding = {
  caleventKey?: string;
  personKey?: string;
  code: 'incompleteSettings' | 'missingNumber' | 'unmappedType' | 'unconfirmed' | 'badDuration' | 'missingLocation' | 'fullDayTraining' | 'notAllowed';
};

const JS_FUNCTION: Record<AttendanceEntry['function'], string> = { leader: 'Leiter/in', participant: 'Teilnehmer/in' };

function isJsActivityType(value: string | undefined): value is JsActivityType {
  return value !== undefined && JS_ACTIVITY_TYPES.indexOf(value) >= 0;
}

/**
 * Neutralises a free-text cell against CSV/formula injection: Excel runs a cell that starts with `=`, `+`, `-`, `@`,
 * tab or carriage return as a formula, so such a cell gets a leading `'`. Only for free text (names, places,
 * external ids), never for dates, times, counts or fixed protocol values.
 */
export function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
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
 * is left out as a whole. With incomplete settings (reported once by the caller) the duration cannot be checked, so
 * `duration` is `undefined` and the event is left out as well: no unchecked rows leave the app.
 */
function checkJsEvent(
  event: CalEventModel,
  activityType: JsActivityType | undefined,
  settings: Partial<JsReportSettings>,
): { findings: ExportFinding['code'][]; duration: string | undefined } {
  const findings: ExportFinding['code'][] = [];
  if (!activityType) return { findings: ['unmappedType'], duration: '' };

  let duration = '';
  if (activityType === 'Training') {
    if (event.fullDay || !event.startTime) findings.push('fullDayTraining'); // ZEIT is required
    if (!getEventLocationName(event)) findings.push('missingLocation');
  }

  if (!(activityType === 'Training' && findings.indexOf('fullDayTraining') >= 0)) {
    if (!isCompleteJsSettings(settings)) {
      return { findings, duration: undefined };
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
  const rows: string[][] = [[...JS_AWK_HEADER]];
  const findings: ExportFinding[] = [];
  const typeMapping = course.typeMapping ?? {};
  const settings = course.reportSettings ?? {};
  if (!isCompleteJsSettings(settings)) findings.push({ code: 'incompleteSettings' });
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
    if (check.duration === undefined) continue; // incomplete settings, already reported

    const isTraining = activityType === 'Training';
    const date = convertDateFormatToString(event.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    for (const entry of present) {
      const number = getExternalId(personByKey.get(entry.person.key), 'js');
      if (!number) {
        findings.push({ caleventKey: event.okey, personKey: entry.person.key, code: 'missingNumber' });
        continue;
      }
      rows.push([
        csvText(number),
        JS_FUNCTION[entry.function],
        date,
        activityType,
        isTraining ? event.startTime : '',
        check.duration,
        isTraining ? csvText(getEventLocationName(event)) : '',
      ]);
    }
  }
  return { rows, findings };
}

/** Column titles of the generic CSV in the user's language. */
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
};

/** Compensation columns (§9.1): the lines and the translated column titles; required together. */
export type GenericCsvCompensation = { lines: CompensationLine[]; labels: { ledCount: string; rate: string; amount: string } };

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
 * (led trainings, rate, amount as decimals) are appended; persons without a line get empty cells.
 */
export function buildGenericCsvRows(table: CourseTable, labels: GenericCsvLabels, compensation?: GenericCsvCompensation): string[][] {
  const presenceLabel: Record<AttendanceEntry['presence'], string> = { present: labels.present, absent: labels.absent, excused: labels.excused };
  const header = [labels.name, labels.firstName, labels.function, ...table.columns.map(eventTitle), labels.total];
  if (compensation) header.push(compensation.labels.ledCount, compensation.labels.rate, compensation.labels.amount);
  const lineByKey = new Map((compensation?.lines ?? []).map(l => [l.person.key, l] as const));

  const rows = table.rows.map(row => {
    const entries = table.columns
      .map(event => table.cells[row.key]?.[event.okey]?.entry)
      .filter((e): e is AttendanceEntry => e !== undefined);
    const fn = predominantFunction(entries, row.isTrainer);
    const cells = table.columns.map(event => {
      const entry = table.cells[row.key]?.[event.okey]?.entry;
      return entry ? presenceLabel[entry.presence] : '';
    });
    const out = [csvText(row.name2), csvText(row.name1), fn === 'leader' ? labels.leader : labels.participant, ...cells, String(entries.filter(e => e.presence === 'present').length)];
    if (compensation) {
      const line = lineByKey.get(row.key);
      out.push(...(line ? [String(line.ledCount), formatMinor(line.rate.amount), formatMinor(line.amount)] : ['', '', '']));
    }
    return out;
  });
  return [header, ...rows];
}
