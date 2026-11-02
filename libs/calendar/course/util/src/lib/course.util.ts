import { CourseModel } from '@okr/shared-models';

/**
 * Search index of a course (`CourseModel.index`), recomputed before every write.
 * Same style as `getCaleventIndex`: `x:` prefixed parts, so a search for «n:Kunstturnen» hits the name only.
 * Trainers are indexed by family name (`AvatarInfo.name2`).
 */
export function getCourseIndex(course: CourseModel): string {
  const trainers = (course.trainers ?? []).map(t => t.name2).join(',');
  return 'g:' + course.groupKey + ' d:' + course.startDate + '-' + course.endDate + ' n:' + course.name + ' t:' + trainers;
}

export function getCourseIndexInfo(): string {
  return 'g:roupKey d:ates n:ame t:rainers';
}
