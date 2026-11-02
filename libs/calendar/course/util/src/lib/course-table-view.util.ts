import { AttendanceEntry, Attendee, AvatarInfo, CalEventModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { ExportFinding } from './course-export.util';
import { CourseTable, courseEventStarted, prefillAttendance } from './course-table.util';

/**
 * A person key that may become a Firestore field path segment (`attendance.<personKey>`). Anything else (empty, a
 * dot, a slash, a space) would address the wrong field or fail the whole write, so it is dropped before writing.
 */
const PLAIN_PERSON_KEY = /^[A-Za-z0-9_]+$/;

export function isPlainPersonKey(key: string | undefined | null): key is string {
  return typeof key === 'string' && PLAIN_PERSON_KEY.test(key);
}

/**
 * One row of the attendance dialog of one event: a person of the course table with what the dialog shows and
 * edits. `presence` / `function` start from the stored entry, else from the prefill (D12).
 */
export type AttendanceRow = {
  person: AvatarInfo;
  isTrainer: boolean;
  /** the sign-up (attendees[].state), shown small next to the name */
  signUp?: Attendee['state'];
  presence: AttendanceEntry['presence'];
  function: AttendanceEntry['function'];
  /** what is stored for this person; `undefined` = nothing stored, the row shows the prefill */
  stored?: Pick<AttendanceEntry, 'presence' | 'function'>;
  /** what the dialog opened with (stored entry or prefill): tells a change the user made from one made elsewhere */
  initial?: Pick<AttendanceEntry, 'presence' | 'function'>;
};

/** The model of the attendance form: the rows of one event. */
export type AttendanceFormModel = { rows: AttendanceRow[] };

function rowAvatar(key: string, name1: string, name2: string): AvatarInfo {
  return { key, name1, name2, modelType: 'person', type: '', subType: '', label: `${name1} ${name2}`.trim() };
}

/**
 * The rows of the attendance dialog for one event, in table order (trainers first, then by name): every person of
 * the table with the stored entry, else the prefill from the sign-up. `trainerKeys` are the course's trainers (the
 * function defaults to `leader` for them).
 */
export function attendanceRowsForEvent(table: CourseTable, event: CalEventModel, trainerKeys: string[]): AttendanceRow[] {
  return table.rows.map(row => {
    const cell = table.cells[row.key]?.[event.okey] ?? {};
    const entry = cell.entry;
    const proposal = entry ?? cell.prefill ?? prefillAttendance(event, row.key, trainerKeys);
    const result: AttendanceRow = {
      person: entry?.person ? { ...entry.person } : rowAvatar(row.key, row.name1, row.name2),
      isTrainer: row.isTrainer,
      presence: proposal.presence,
      function: proposal.function,
      initial: { presence: proposal.presence, function: proposal.function },
    };
    if (cell.signUp) result.signUp = cell.signUp;
    if (entry) result.stored = { presence: entry.presence, function: entry.function };
    return result;
  });
}

type PresenceAndFunction = Pick<AttendanceEntry, 'presence' | 'function'>;

function same(a: PresenceAndFunction | undefined, b: PresenceAndFunction | undefined): boolean {
  return !!a && !!b && a.presence === b.presence && a.function === b.function;
}

/**
 * The attendance entries to write for one event (§7.3), merged against the LIVE attendance of the event (what is
 * stored now, not what the dialog saw when it opened):
 * - a person without a live entry is written (the first confirmation therefore writes every row, the unchanged
 *   prefill included);
 * - a row equal to its live entry is not written (its `by`/`at` stay);
 * - a row that differs from its live entry is written only when the user changed it in the dialog (it differs from
 *   `initial`). A row the user left alone keeps what somebody else stored meanwhile — a confirmation or correction made
 *   while the dialog was open is never overwritten with a stale value and a later writer's `by`/`at`.
 * Rows with an empty or non-plain person key are dropped (they cannot be a field path), a person listed twice is
 * written once (the first row wins).
 */
export function attendanceEntriesToWrite(
  rows: AttendanceRow[],
  by: string,
  at: string,
  live: Record<string, PresenceAndFunction> | undefined,
): AttendanceEntry[] {
  const seen = new Set<string>();
  const entries: AttendanceEntry[] = [];
  for (const row of rows) {
    const key = row.person?.key;
    if (!isPlainPersonKey(key) || seen.has(key)) continue;
    seen.add(key);
    const current = live?.[key];
    if (current) {
      if (same(row, current)) continue;
      const changedByUser = !row.initial || !same(row, row.initial);
      if (!changedByUser) continue;
    }
    entries.push({ person: { ...row.person }, presence: row.presence, function: row.function, by, at });
  }
  return entries;
}

/** The findings as the table shows them: `incompleteSettings` once at the top, the rest inline. */
export type VisibleFindings = { incompleteSettings: boolean; findings: ExportFinding[] };

/**
 * Filters the export findings for the table: `incompleteSettings` becomes a flag (shown once, with the hint to
 * complete the course's J+S settings), and `unconfirmed` is kept only for events that have begun — a future event
 * cannot be confirmed yet, so it is not a problem to report.
 */
export function visibleFindings(findings: ExportFinding[], events: CalEventModel[], today: string, nowTime?: string): VisibleFindings {
  const byKey = new Map(events.map(e => [e.okey, e] as const));
  let incompleteSettings = false;
  const visible: ExportFinding[] = [];
  for (const f of findings) {
    if (f.code === 'incompleteSettings') {
      incompleteSettings = true;
      continue;
    }
    if (f.code === 'unconfirmed') {
      const event = f.caleventKey ? byKey.get(f.caleventKey) : undefined;
      if (!event || !courseEventStarted(event, today, nowTime)) continue;
    }
    visible.push(f);
  }
  return { incompleteSettings, findings: visible };
}

/** The persons without a J+S number among the findings, each once, in order of appearance. */
export function missingNumberKeys(findings: ExportFinding[]): string[] {
  const keys: string[] = [];
  for (const f of findings) {
    if (f.code === 'missingNumber' && f.personKey && !keys.includes(f.personKey)) keys.push(f.personKey);
  }
  return keys;
}

/**
 * The sums of the table (§8): stored `present` entries per event and per person. The prefill is never counted —
 * it is a proposal, not an attendance.
 */
export function presentCounts(table: CourseTable): { perEvent: Record<string, number>; perPerson: Record<string, number> } {
  const perEvent: Record<string, number> = {};
  const perPerson: Record<string, number> = {};
  for (const event of table.columns) perEvent[event.okey] = 0;
  for (const row of table.rows) {
    let count = 0;
    for (const event of table.columns) {
      if (table.cells[row.key]?.[event.okey]?.entry?.presence === 'present') {
        count++;
        perEvent[event.okey]++;
      }
    }
    perPerson[row.key] = count;
  }
  return { perEvent, perPerson };
}

/**
 * A file name from free text (course name or J+S course number): characters a file system or a download dialog
 * chokes on become `_`, runs collapse, and an empty result falls back to `fallback`.
 */
export function courseFileBase(text: string | undefined, fallback: string): string {
  const cleaned = (text ?? '').trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  return cleaned || fallback;
}

/**
 * «03.11.2026 18:00» (full-day: the date only) — the event as messages name it. StoreDate/StoreTime are wall-clock
 * values (calendar skill): converted as text, never through an instant.
 */
export function courseEventLabel(event: Pick<CalEventModel, 'startDate' | 'startTime' | 'fullDay'>): string {
  const date = event.startDate ? convertDateFormatToString(event.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
  return event.fullDay || !event.startTime ? date : `${date} ${event.startTime}`;
}
