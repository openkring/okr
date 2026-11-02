import { Attendee, AttendanceEntry, CalEventModel, CourseModel, MembershipModel } from '@okr/shared-models';

/** A row of the course table: one person (spec 1.132 §7.4). */
export type CourseRowPerson = { key: string; name1: string; name2: string; isTrainer: boolean };

/**
 * One cell, `cells[personKey][caleventKey]`. `signUp` is the answer from the event's attendees (small in the UI),
 * `entry` the stored attendance (large), `prefill` the proposal shown while nothing is stored. Never saved (D12).
 */
export type CourseCell = {
  signUp?: Attendee['state'];
  entry?: AttendanceEntry;
  prefill?: Pick<AttendanceEntry, 'presence' | 'function'>;
};

export type CourseTable = {
  columns: CalEventModel[];
  rows: CourseRowPerson[];
  cells: Record<string, Record<string, CourseCell>>;
  /** Group events in the course period that belong to no course; `suggested` = `type` is a key of `typeMapping` (D11). */
  unassigned: { event: CalEventModel; suggested: boolean }[];
};

const STILL_MEMBER = '99991231';

function byStart(a: CalEventModel, b: CalEventModel): number {
  return (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime);
}

function isCounted(e: CalEventModel): boolean {
  return !e.isArchived && e.state !== 'cancelled';
}

/** The events that count for a course: not archived, not cancelled, in calendar order. Archived and cancelled count nowhere (§7.3). */
export function courseEvents(events: CalEventModel[]): CalEventModel[] {
  return events.filter(isCounted).sort(byStart);
}

/**
 * Whether the event has begun. `today` is a StoreDate; without `nowTime` ('HH:mm') the whole day counts as begun,
 * with it an event later today has not. A full-day event (no `startTime`) begins with its day.
 */
export function courseEventStarted(event: CalEventModel, today: string, nowTime?: string): boolean {
  if (event.startDate < today) return true;
  if (event.startDate > today) return false;
  return nowTime === undefined || (event.startTime ?? '') <= nowTime;
}

/**
 * Whether a membership of a group overlaps the period, both ends inclusive. An empty or `99991231` exit means
 * still a member. `orgModelType: 'org'` is not a group membership (group skill) and never matches.
 */
export function isMemberDuring(m: MembershipModel, startDate: string, endDate: string): boolean {
  if (m.isArchived || m.orgModelType !== 'group' || m.memberModelType !== 'person') return false;
  const entry = m.dateOfEntry || '';
  const exit = m.dateOfExit || STILL_MEMBER;
  return entry <= endDate && exit >= startDate;
}

/**
 * The rows of the course table: the trainers, the group members who were members during the course, and everybody
 * on the course events' `attendees` or `attendance` (guests, substitutes). Trainers first, then by last and first name.
 * `members` are the memberships of the course's group.
 */
export function courseRowPersons(course: CourseModel, members: MembershipModel[], events: CalEventModel[]): CourseRowPerson[] {
  const trainerKeys = new Set((course.trainers ?? []).map(t => t.key));
  const byKey = new Map<string, CourseRowPerson>();
  const add = (key: string, name1: string, name2: string): void => {
    if (!byKey.has(key)) byKey.set(key, { key, name1, name2, isTrainer: trainerKeys.has(key) });
  };

  for (const t of course.trainers ?? []) add(t.key, t.name1, t.name2);
  for (const m of members) {
    if (isMemberDuring(m, course.startDate, course.endDate)) add(m.memberKey, m.memberName1, m.memberName2);
  }
  for (const e of courseEvents(events)) {
    for (const a of e.attendees ?? []) add(a.person.key, a.person.name1, a.person.name2);
    for (const [key, entry] of Object.entries(e.attendance ?? {})) add(key, entry.person.name1, entry.person.name2);
  }

  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.isTrainer) - Number(a.isTrainer) ||
      a.name2.localeCompare(b.name2, 'de') ||
      a.name1.localeCompare(b.name1, 'de'),
  );
}

/**
 * The proposal for the attendance of one person, from the sign-up: accepted → present, declined → excused,
 * invited or no answer → absent. The function defaults to `leader` for trainers, else `participant` (§7.3).
 */
export function prefillAttendance(event: CalEventModel, personKey: string, trainerKeys: string[]): Pick<AttendanceEntry, 'presence' | 'function'> {
  const state = (event.attendees ?? []).find(a => a.person.key === personKey)?.state;
  const presence: AttendanceEntry['presence'] = state === 'accepted' ? 'present' : state === 'declined' ? 'excused' : 'absent';
  return { presence, function: trainerKeys.includes(personKey) ? 'leader' : 'participant' };
}

/**
 * The course table (§8). `events` are the course's events, `groupEvents` all events of the group's calendar (to find the
 * unassigned ones), `members` the memberships of the course's group. `today` is a StoreDate; pass `nowTime` ('HH:mm') so
 * an event later today is not yet prefilled. The prefill appears from the event start on and only where nothing is stored.
 */
export function buildCourseTable(
  course: CourseModel,
  events: CalEventModel[],
  groupEvents: CalEventModel[],
  members: MembershipModel[],
  today: string,
  nowTime?: string,
): CourseTable {
  const columns = courseEvents(events);
  const rows = courseRowPersons(course, members, events);
  const trainerKeys = (course.trainers ?? []).map(t => t.key);

  const cells: CourseTable['cells'] = {};
  for (const row of rows) {
    const personCells: Record<string, CourseCell> = {};
    for (const event of columns) {
      const cell: CourseCell = {};
      const signUp = (event.attendees ?? []).find(a => a.person.key === row.key)?.state;
      if (signUp) cell.signUp = signUp;
      const entry = (event.attendance ?? {})[row.key];
      if (entry) cell.entry = entry;
      else if (courseEventStarted(event, today, nowTime)) cell.prefill = prefillAttendance(event, row.key, trainerKeys);
      personCells[event.okey] = cell;
    }
    cells[row.key] = personCells;
  }

  const typeMapping = course.typeMapping ?? {};
  const unassigned = groupEvents
    .filter(e => isCounted(e) && !(e.courseKey ?? '') && e.startDate >= course.startDate && e.startDate <= course.endDate)
    .sort(byStart)
    .map(event => ({ event, suggested: Object.hasOwn(typeMapping, event.type) }));

  return { columns, rows, cells, unassigned };
}

/** Course events that have begun and whose attendance nobody confirmed; they block freezing the course (§7.8). */
export function unconfirmedPastEvents(events: CalEventModel[], today: string, nowTime?: string): CalEventModel[] {
  return courseEvents(events).filter(e => !e.attendanceConfirmedAt && courseEventStarted(e, today, nowTime));
}
