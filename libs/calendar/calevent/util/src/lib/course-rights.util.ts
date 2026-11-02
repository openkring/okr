import { CalEventModel, CourseModel } from '@okr/shared-models';
import { isAfterDate } from '@okr/shared-util-core';

/**
 * Course trainers and the calendar (spec 1.132 §6, «Trainer bearbeiten Kurstermine»).
 *
 * In a group calendar only a group admin could change events. A trainer of a course may now create, change and
 * delete the events that carry THIS course's key — not events without a `courseKey` or with a foreign one. The
 * Firestore rules mirror it (create with a `courseKey` needs a course editor of that course; changing `courseKey`,
 * attendance, deleting or archiving an event of a course needs an editor on an unlocked course), so these helpers
 * only decide what the UI offers.
 */

/** Just the part of an event the rights depend on: a new event is described by its preset `courseKey` alone. */
export type CourseKeyed = Pick<CalEventModel, 'courseKey'>;

/** The course with this key, if the list holds it. An empty key names no course. */
export function courseOfKey(courseKey: string | undefined, courses: CourseModel[]): CourseModel | undefined {
  return courseKey ? courses.find(course => course.okey === courseKey) : undefined;
}

/**
 * Whether the person is a trainer (or responsible, `trainerKeys` mirrors both) of the course the event belongs to.
 *
 * @param calevent the event; for a NEW event the caller passes `{ courseKey }` with the preset key (or `undefined`)
 * @param courses  the courses the caller knows (those of the group); a key that names none of them is no course
 * @param personKey the person to test
 */
export function isCourseTrainerFor(calevent: CourseKeyed | undefined, courses: CourseModel[], personKey: string): boolean {
  if (!personKey) return false;
  const course = courseOfKey(calevent?.courseKey, courses);
  return !!course?.trainerKeys?.includes(personKey);
}

/** The distinct, non-empty `courseKey`s of the events, in order of first appearance. */
export function courseKeysOf(events: CourseKeyed[]): string[] {
  const keys: string[] = [];
  for (const event of events) {
    if (event.courseKey && !keys.includes(event.courseKey)) keys.push(event.courseKey);
  }
  return keys;
}

/** The locked courses among the given ones; a hole (a course that could not be read) is skipped. */
export function lockedCoursesOf(courses: (CourseModel | undefined)[]): CourseModel[] {
  return courses.filter((course): course is CourseModel => !!course?.isLocked);
}

/** The events that belong to one of the locked courses. */
export function eventsOfLockedCourses<T extends CourseKeyed>(events: T[], courses: (CourseModel | undefined)[]): T[] {
  const locked = new Set(lockedCoursesOf(courses).map(course => course.okey));
  return events.filter(event => !!event.courseKey && locked.has(event.courseKey));
}

/**
 * What «Serie hinzufügen» on the course table presets on the new event: the course's key (so the series belongs to
 * the course from its first save), its name, a weekly rhythm, and the course's period — from the later of today and
 * the course start up to the course end. A course that is already over leaves the end to the form's own default.
 * The user can change every one of them in the edit modal.
 *
 * @param today StoreDate
 */
export function courseSeriesPatch(course: CourseModel, today: string): Partial<CalEventModel> {
  const startDate = isAfterDate(course.startDate, today) ? course.startDate : today;
  const patch: Partial<CalEventModel> = { courseKey: course.okey, name: course.name, periodicity: 'weekly', startDate };
  if (course.endDate === startDate || isAfterDate(course.endDate, startDate)) patch.repeatUntilDate = course.endDate;
  return patch;
}

/** Whether the course has ended: its last day lies before `today` (StoreDates). A course without a valid end is never over. */
export function isCourseOver(course: Pick<CourseModel, 'endDate'>, today: string): boolean {
  return isAfterDate(today, course.endDate);
}

/**
 * The courses a series reconcile touches, to be checked for a lock BEFORE the first write: the rules deny archiving
 * an event of a locked course and creating one with its key, and the update batch commits before the creates, so a
 * late denial would leave a half-written series.
 *
 * @param plan the reconcile plan: occurrences to archive and dates to create
 * @param editedCourseKey the `courseKey` of the edited event, which every newly created occurrence carries
 */
export function seriesPlanCourseKeys(plan: { archives: CourseKeyed[]; creates: unknown[] }, editedCourseKey: string | undefined): { removal: string[]; addition: string[] } {
  return {
    removal: courseKeysOf(plan.archives),
    addition: plan.creates.length > 0 && editedCourseKey ? [editedCourseKey] : [],
  };
}

/**
 * Whether the edit changed the event's `courseKey` (edited value vs. the stored value of the same occurrence).
 * A series update writes `courseKey` to the siblings only then; otherwise a sibling of a mixed series (one assigned,
 * one not) would be silently reassigned, or the whole batch denied by the rules.
 */
export function courseKeyChanged(edited: CourseKeyed, stored: CourseKeyed | undefined): boolean {
  if (!stored) return false;
  return (edited.courseKey ?? '') !== (stored.courseKey ?? '');
}
