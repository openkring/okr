import { CourseModel } from '@okr/shared-models';

import { CourseAccess, isCourseTrainer, mayManageCourse } from './course-access.util';
import { COURSE_I18N_KEYS, CourseI18n } from './course-i18n';

/** Whose help the (i) button opens (spec 1.132 §10, D8). */
export type CourseHelpRole = 'trainer' | 'responsible' | 'treasurer' | 'participant';

/** Strongest first: a person with several roles gets the help of the one that can do the most. */
export const COURSE_HELP_ROLE_ORDER: readonly CourseHelpRole[] = ['responsible', 'trainer', 'treasurer', 'participant'];

/**
 * What the viewer is on the screen that offers the (i). Each flag is already decided by the caller
 * (`mayManageCourse`, `isCourseTrainer`, `hasRole('treasurer')`).
 */
export type CourseHelpFlags = {
  /** responsible person, admin of the course's group, privileged: manages the course */
  manages: boolean;
  /** trainer of the course (a responsible person counts as well, see `isCourseTrainer`) */
  trains: boolean;
  isTreasurer: boolean;
};

/** The help role of a viewer: manager → 'responsible', trainer → 'trainer', treasurer → 'treasurer', else 'participant'. */
export function pickCourseHelpRole(flags: CourseHelpFlags): CourseHelpRole {
  if (flags.manages) return 'responsible';
  if (flags.trains) return 'trainer';
  if (flags.isTreasurer) return 'treasurer';
  return 'participant';
}

/** The help role of the viewer for one course (the course table). */
export function courseHelpRoleFor(course: CourseModel, access: CourseAccess): CourseHelpRole {
  return pickCourseHelpRole({
    manages: mayManageCourse(course, access),
    trains: isCourseTrainer(course, access.personKey),
    isTreasurer: access.isTreasurer,
  });
}

/** The strongest of several roles (the course list: one help for all listed courses). An empty list yields 'participant'. */
export function strongestCourseHelpRole(roles: readonly CourseHelpRole[]): CourseHelpRole {
  return COURSE_HELP_ROLE_ORDER.find(role => roles.includes(role)) ?? 'participant';
}

/**
 * The help role of the viewer on the course list: the strongest role over the listed courses. Without any listed
 * course, the rights that need no course decide (privileged / group admin of the listed group → 'responsible',
 * treasurer → 'treasurer').
 * @param accessFor the viewer's access for one course (the group-admin flag belongs to the course's own group)
 * @param access the viewer's access for the listed group, used when no course is listed
 */
export function courseListHelpRole(courses: readonly CourseModel[], accessFor: (course: CourseModel) => CourseAccess, access: CourseAccess): CourseHelpRole {
  const fromCourses = courses.map(course => courseHelpRoleFor(course, accessFor(course)));
  const fromAccess = pickCourseHelpRole({
    manages: access.isPrivileged || access.isGroupAdmin,
    trains: false,
    isTreasurer: access.isTreasurer,
  });
  return strongestCourseHelpRole([...fromCourses, fromAccess]);
}

/** One block of the help: a heading and a text (lines separated by `\n`). Both are keys of `CourseI18n`. */
export type CourseHelpSection = { title: keyof CourseI18n; text: keyof CourseI18n };

/** The blocks of each role, in reading order. The wording lives in the i18n files (`help.<role>.*`). */
export const COURSE_HELP_SECTIONS: Record<CourseHelpRole, readonly CourseHelpSection[]> = {
  trainer: [
    { title: 'help_trainer_confirm_title', text: 'help_trainer_confirm_text' },
    { title: 'help_trainer_function_title', text: 'help_trainer_function_text' },
    { title: 'help_trainer_series_title', text: 'help_trainer_series_text' },
    { title: 'help_trainer_assign_title', text: 'help_trainer_assign_text' },
    { title: 'help_trainer_export_title', text: 'help_trainer_export_text' },
  ],
  responsible: [
    { title: 'help_responsible_setup_title', text: 'help_responsible_setup_text' },
    { title: 'help_responsible_running_title', text: 'help_responsible_running_text' },
    { title: 'help_responsible_lock_title', text: 'help_responsible_lock_text' },
    { title: 'help_responsible_js_title', text: 'help_responsible_js_text' },
    { title: 'help_responsible_nds_title', text: 'help_responsible_nds_text' },
    { title: 'help_responsible_numbers_title', text: 'help_responsible_numbers_text' },
    { title: 'help_responsible_request_title', text: 'help_responsible_request_text' },
    { title: 'help_responsible_reported_title', text: 'help_responsible_reported_text' },
  ],
  treasurer: [
    { title: 'help_treasurer_task_title', text: 'help_treasurer_task_text' },
    { title: 'help_treasurer_review_title', text: 'help_treasurer_review_text' },
    { title: 'help_treasurer_external_title', text: 'help_treasurer_external_text' },
    { title: 'help_treasurer_payment_title', text: 'help_treasurer_payment_text' },
    { title: 'help_treasurer_again_title', text: 'help_treasurer_again_text' },
    { title: 'help_treasurer_yearly_title', text: 'help_treasurer_yearly_text' },
  ],
  participant: [
    { title: 'help_participant_signup_title', text: 'help_participant_signup_text' },
    { title: 'help_participant_attendance_title', text: 'help_participant_attendance_text' },
    { title: 'help_participant_table_title', text: 'help_participant_table_text' },
  ],
};

/** Does a task's `linkKey` point at a course? Both course tasks (end task, compensation review) carry `course.<key>`. */
export function isCourseLinkKey(linkKey: string | undefined | null): boolean {
  return (linkKey ?? '').startsWith('course.');
}

/**
 * Whose help the (i) of a course task opens. The nightly end task (`course-<key>-end`, spec 1.132 §7.5) is for the
 * course's responsible person; the only other course task is the treasurer's compensation review (§7.6).
 */
export function courseTaskHelpRole(task: { okey?: string }): CourseHelpRole {
  return /^course-.+-end$/.test(task.okey ?? '') ? 'responsible' : 'treasurer';
}

/** The six steps of the Anmeldeprozess (spec 1.152 §1), in order. Keys of `CourseI18n`. */
export const COURSE_PROCESS_STEPS: readonly (keyof CourseI18n)[] = [
  'help_process_step1', 'help_process_step2', 'help_process_step3', 'help_process_step4', 'help_process_step5', 'help_process_step6',
];

/** The invite block after the steps: heading and text. Keys of `CourseI18n`. */
export const COURSE_PROCESS_INVITE: CourseHelpSection = { title: 'help_process_invite_title', text: 'help_process_invite_text' };

/** Every i18n key (as stored in the i18n files) of the «Anmeldeprozess» section, in reading order. */
export const COURSE_PROCESS_HELP_KEYS: readonly string[] = [
  COURSE_I18N_KEYS.help_process_title,
  ...COURSE_PROCESS_STEPS.map(step => COURSE_I18N_KEYS[step]),
  COURSE_I18N_KEYS[COURSE_PROCESS_INVITE.title],
  COURSE_I18N_KEYS[COURSE_PROCESS_INVITE.text],
];
