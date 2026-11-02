import { CalEventModel, CourseFinanceModel, CourseModel, MembershipModel } from '@okr/shared-models';

import { courseEvents } from './course-table.util';

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
  /** `roles.eventAdmin` (via `hasRole`, which includes `admin`); absent = false */
  isEventAdmin?: boolean;
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
 * Who may read the protected finance document `courses/{key}/finance/settings`: everybody who manages the course,
 * plus the treasurer. Mirrors `courseFinanceOk` in firestore.rules. A trainer who is not responsible must not even
 * trigger the read.
 */
export function mayReadCourseFinance(course: CourseModel, access: CourseAccess): boolean {
  return mayManageCourse(course, access) || access.isTreasurer;
}

/**
 * Who may WRITE the finance document: only who manages the course (privileged, group admin, responsible). The
 * treasurer reads the rates but does not set them (spec §6); mirrors `courseFinanceWriteOk` in firestore.rules.
 */
export function mayWriteCourseFinance(course: CourseModel, access: CourseAccess): boolean {
  return mayManageCourse(course, access);
}

/**
 * Is the person one of the course's trainers or responsible persons? This is what the rules' `trainerKeys` mirror
 * holds (trainers + responsible persons); the arrays are read because the server-maintained mirror lags.
 */
export function isCourseTrainer(course: CourseModel, personKey: string | undefined): boolean {
  if (!personKey) return false;
  return isCourseResponsible(course, personKey) || (course.trainers ?? []).some(p => p.key === personKey);
}

/**
 * Who may confirm the attendance of a course event and assign events to the course or take them out (§6, §7.2, §7.3):
 * a trainer or responsible person, an admin of the course's group, `eventAdmin` or privileged — and only while the
 * course is not locked (a locked course freezes attendance and assignment for everybody). Mirrors the calevent rules
 * (spec 1.132 §6.1); the rules are the guard, this hides the controls.
 */
export function mayEditCourseAttendance(course: CourseModel, access: CourseAccess): boolean {
  if (course.isLocked === true) return false;
  return access.isPrivileged || access.isGroupAdmin || access.isEventAdmin === true || isCourseTrainer(course, access.personKey);
}

/**
 * Who may export the course table (§6: generic CSV, J+S file) and see the export findings: everybody who may edit
 * the attendance (locked or not), plus the treasurer. Plain members see the table but get no export (D7).
 */
export function mayExportCourse(course: CourseModel, access: CourseAccess): boolean {
  return mayEditCourseAttendance({ ...course, isLocked: false }, access) || access.isTreasurer;
}

/**
 * Who may open the course table (spec 1.132 §8, §13: it shows the attendance of minors). Everybody with a role in
 * the course (export, finance, manage, trainer — see the functions above), a member of the course's group
 * (`ownGroupMemberships` = the current person's memberships with `orgModelType: 'group'`; an `org` membership never
 * counts), or a person who appears in the table through a counted event (`attendees` or `attendance`: guests,
 * substitutes). Anybody else of the tenant gets the not-found state.
 */
export function mayViewCourseTable(
  course: CourseModel,
  access: CourseAccess,
  ownGroupMemberships: MembershipModel[],
  events: CalEventModel[],
): boolean {
  if (mayExportCourse(course, access) || mayReadCourseFinance(course, access) || isCourseTrainer(course, access.personKey)) return true;
  const personKey = access.personKey;
  if (!personKey) return false;
  const isGroupMember = ownGroupMemberships.some(m =>
    !m.isArchived && m.orgModelType === 'group' && m.memberModelType === 'person' && m.orgKey === course.groupKey && m.memberKey === personKey);
  if (isGroupMember) return true;
  return courseEvents(events).some(e =>
    (e.attendees ?? []).some(a => a.person?.key === personKey) || Object.prototype.hasOwnProperty.call(e.attendance ?? {}, personKey));
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
