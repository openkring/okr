import { CourseFinanceModel, CourseModel } from '@okr/shared-models';

/** Route value of `groupKey` for the tenant-wide overview (all courses of all groups, the treasurer's entry). */
export const ALL_COURSES_KEY = 'all';

/**
 * What the current user is, as far as the course rules are concerned. The caller derives it from the app state
 * (`personKey` from the user, `isGroupAdmin` from the course group's `admins[]`, the two roles via `hasRole`,
 * which already includes `admin`).
 */
export type CourseAccess = {
  personKey: string;
  /** admin of the group the course belongs to */
  isGroupAdmin: boolean;
  isPrivileged: boolean;
  isTreasurer: boolean;
};

/** Is the person one of the course's responsible persons? Reads the arrays, not the server-maintained mirror (which lags). */
export function isCourseResponsible(course: CourseModel, personKey: string | undefined): boolean {
  if (!personKey) return false;
  return (course.responsiblePersons ?? []).some(p => p.key === personKey);
}

/**
 * Who may edit a course or archive it: privileged, a responsible person, or an admin of the course's group.
 * Mirrors `isCourseManager` in firestore.rules (spec 1.132 §6.1); the rules are the guard, this hides the buttons.
 */
export function mayManageCourse(course: CourseModel, access: CourseAccess): boolean {
  return access.isPrivileged || access.isGroupAdmin || isCourseResponsible(course, access.personKey);
}

/**
 * Who may read (and write) the protected finance document `courses/{key}/finance/settings`: everybody who manages
 * the course, plus the treasurer. Mirrors `courseFinanceOk` in firestore.rules. A trainer who is not responsible
 * must not even trigger the read.
 */
export function mayReadCourseFinance(course: CourseModel, access: CourseAccess): boolean {
  return mayManageCourse(course, access) || access.isTreasurer;
}

/** Who may create a course in a group: privileged or an admin of that group (the rules require it on create). */
export function mayCreateCourse(access: Pick<CourseAccess, 'isGroupAdmin' | 'isPrivileged'>): boolean {
  return access.isPrivileged || access.isGroupAdmin;
}

/**
 * Whether the «…» menu of the course list opens at all. It must also open on an EMPTY list for somebody who may
 * create (a group admin has no course to be «responsible» for yet, and `add` is the first thing they need).
 * @param canAdd may create a course in the listed group (`mayCreateCourse`)
 * @param managesListedCourse manages at least one listed course (responsible, admin of its group, privileged)
 */
export function mayOpenCourseMenu(access: Pick<CourseAccess, 'isPrivileged' | 'isTreasurer'>, canAdd: boolean, managesListedCourse: boolean): boolean {
  return canAdd || access.isPrivileged || access.isTreasurer || managesListedCourse;
}

/** What the edit dialog gets for the finance part, see {@link loadFinanceForEdit}. */
export type FinanceForEdit = {
  /** the document to edit, a deliberately new one, or `undefined` = no finance part at all */
  finance: CourseFinanceModel | undefined;
  /** the user may read the amounts, but the read failed: the dialog opens without them and says so */
  unavailable: boolean;
};

/**
 * Decides what the edit dialog gets for the finance part. `saveFinance` overwrites the whole document, so a blank
 * form must only ever be offered when the server CONFIRMED that there is no document:
 * - not allowed to read → no finance part, and no read is attempted;
 * - the read returns the document → edit it;
 * - the read returns `null` (confirmed missing) → a new document, «set up compensation»;
 * - the read rejects (unknown: offline, denied, timeout) → NO finance part (nothing saveable) and `unavailable`.
 */
export async function loadFinanceForEdit(mayRead: boolean, read: () => Promise<CourseFinanceModel | null>): Promise<FinanceForEdit> {
  if (!mayRead) return { finance: undefined, unavailable: false };
  try {
    const stored = await read();
    return { finance: stored ?? new CourseFinanceModel(), unavailable: false };
  } catch (err) {
    // the user gets a generic toast; this is what makes a recurring «finance unavailable» diagnosable
    console.warn('loadFinanceForEdit: the finance document could not be read, the dialog opens without it.', err);
    return { finance: undefined, unavailable: true };
  }
}
