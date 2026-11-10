import { logger } from 'firebase-functions/v2';

import type { CourseField, DerivedValue } from '@okr/shared-models';
import { holdsCoursePlace, isAnnouncedCourseOpen, toCourseOption, type PublicCourseOption } from '@okr/shared-util-core';

/**
 * Announced courses for the Anmeldung form (spec 1.152 §7.1): the gateway hands the public renderers the
 * courses on offer plus the one derived value that decides the applicant type. Logic lives here so that
 * `getFormDefinition` only calls it.
 */

/** The (at most one) course field of a form, or undefined. Tolerates legacy documents without fields. */
export function courseFieldOf(fields: unknown): CourseField | undefined {
  const list = Array.isArray(fields) ? fields as Record<string, unknown>[] : [];
  return list.find(f => f?.['type'] === 'course') as unknown as CourseField | undefined;
}

/** Only the derived value that holds the applicant type; the other derived values stay on the server. */
export function projectCourseAudience(derived: unknown, audienceFrom: string): DerivedValue | undefined {
  const list = Array.isArray(derived) ? derived as DerivedValue[] : [];
  return list.find(d => d?.key === audienceFrom);
}

/** Places taken on a course: applications of this tenant that hold a place (decided in code). */
export async function countCoursePlaces(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  courseKey: string,
): Promise<number> {
  const snap = await db.collection('applications')
    .where('tenants', 'array-contains', tenantId)
    .where('courseKey', '==', courseKey)
    .where('isArchived', '==', false)
    .get();
  return snap.docs.filter(d => holdsCoursePlace(d.data(), courseKey)).length;
}

/**
 * The announced, still-open courses of a tenant with their free places, by start date. A read error is
 * logged and gives `[]`: the form stays usable, the course choice just shows nothing.
 */
export async function readAnnouncedCourses(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  today: string,
): Promise<PublicCourseOption[]> {
  try {
    const snap = await db.collection('courses')
      .where('tenants', 'array-contains', tenantId)
      .where('isAnnounced', '==', true)
      .get();
    const open = snap.docs
      .map(d => ({ ...d.data(), okey: d.id }))
      .filter(c => isAnnouncedCourseOpen(c, today));
    const options = await Promise.all(open.map(async c => toCourseOption(c, await countCoursePlaces(db, tenantId, c.okey))));
    return options.sort((a, b) => a.startDate.localeCompare(b.startDate));
  } catch (e) {
    logger.warn('getFormDefinition: could not read announced courses', e);
    return [];
  }
}

/** Adds `courseAudience` and `courses` to the projected definition, only for a form with a course field. */
export function withCourseChoice(
  projected: Record<string, unknown>,
  fields: unknown,
  derived: unknown,
  courses: PublicCourseOption[],
): Record<string, unknown> {
  const field = courseFieldOf(fields);
  if (!field) return projected;
  const courseAudience = projectCourseAudience(derived, field.audienceFrom);
  return { ...projected, ...(courseAudience ? { courseAudience } : {}), courses };
}
