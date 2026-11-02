import { groupAdminKeys } from '../group/group-admin-keys';

/** The slice of `courses/{id}` the key mirrors are derived from (legacy docs may lack either array). */
export type CourseKeySource = {
  trainers?: { key?: string }[];
  responsiblePersons?: { key?: string }[];
};

/**
 * `courses/{id}.trainerKeys` — the personKeys that may edit the course: trainers first, then the responsible
 * persons, exact case, duplicates and empty keys dropped. Same mirror pattern as `groups/{id}.adminKeys`.
 */
export function courseTrainerKeys(course: CourseKeySource): string[] {
  return groupAdminKeys([...(course.trainers ?? []), ...(course.responsiblePersons ?? [])]);
}

/** `courses/{id}.responsibleKeys` — the personKeys that manage the course and read its finance document. */
export function courseResponsibleKeys(course: CourseKeySource): string[] {
  return groupAdminKeys(course.responsiblePersons);
}
