import type { ApplicationKind, ApplicationModel, CourseModel } from '@okr/shared-models';

/**
 * Course choice in the Anmeldung (spec 1.152). Pure helpers, no clock: `today` is a StoreDate
 * (`yyyyMMdd`, Europe/Zurich) passed by the caller. All inputs may be raw Firestore documents
 * that lack the new fields, so every read is coalesced.
 */

/** A course as offered to an applicant. `remaining` -1 = unlimited. No personal or finance data. */
export type PublicCourseOption = {
  key: string;
  name: string;
  startDate: string;
  endDate: string;
  audience: ApplicationKind[];
  remaining: number;
  isFull: boolean;
};

const PLACE_HOLDING_COURSE_STATES: readonly string[] = ['registered', 'invited', 'accepted'];
const PLACE_RELEASING_STATES: readonly string[] = ['closed.denied', 'closed.cancelled'];

/** Create-time default of `isAnnounced`: true only for a pure youth course. */
export function defaultIsAnnounced(audience: ApplicationKind[]): boolean {
  return audience.length === 1 && audience[0] === 'youth';
}

/** Whether an application occupies a place on the course (A7). */
export function holdsCoursePlace(app: Partial<ApplicationModel>, courseKey: string): boolean {
  if (!courseKey || app.courseKey !== courseKey) return false;
  if (app.isArchived === true) return false;
  if (!PLACE_HOLDING_COURSE_STATES.includes(app.courseState ?? '')) return false;
  return !PLACE_RELEASING_STATES.includes(app.state ?? '');
}

/** Announced, not archived, not ended (A2) and offered to at least one applicant type. */
export function isAnnouncedCourseOpen(course: Partial<CourseModel>, today: string): boolean {
  if (course.isAnnounced !== true) return false;
  if (course.isArchived === true) return false;
  if ((course.audience ?? []).length === 0) return false;
  const endDate = course.endDate ?? '';
  return endDate !== '' && endDate >= today;
}

export function toCourseOption(course: Partial<CourseModel> & { okey: string }, placesTaken: number): PublicCourseOption {
  const max = course.maxParticipants ?? 0;
  const unlimited = max <= 0;
  return {
    key: course.okey,
    name: course.name ?? '',
    startDate: course.startDate ?? '',
    endDate: course.endDate ?? '',
    audience: course.audience ?? [],
    remaining: unlimited ? -1 : Math.max(0, max - placesTaken),
    isFull: !unlimited && placesTaken >= max,
  };
}

/** Courses offered to an applicant type, sorted by start date. Unknown audience → none. */
export function coursesForAudience(options: PublicCourseOption[], audience: string | undefined): PublicCourseOption[] {
  if (!audience) return [];
  return options
    .filter(o => o.audience.includes(audience as ApplicationKind))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Server-side check of a course choice. `course` is the document as read from Firestore (may be
 * undefined or lack fields). Returns the refusal reason, or undefined when the choice is valid.
 */
export function courseChoiceRefusal(
  course: Partial<CourseModel> | undefined,
  tenantId: string,
  audience: string | undefined,
  placesTaken: number,
  today: string,
): 'course-unavailable' | undefined {
  const refused = 'course-unavailable';
  if (!course) return refused;
  if (!(course.tenants ?? []).includes(tenantId)) return refused;
  if (!isAnnouncedCourseOpen(course, today)) return refused;
  if (!audience || !(course.audience ?? []).includes(audience as ApplicationKind)) return refused;
  const max = course.maxParticipants ?? 0;
  if (max > 0 && placesTaken >= max) return refused;
  return undefined;
}
