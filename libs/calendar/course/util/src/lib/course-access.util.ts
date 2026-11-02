import { CourseModel } from '@okr/shared-models';

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
