import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';

import { CourseCollection } from '@okr/shared-models';
import type { CourseField, CourseModel, DerivedValue } from '@okr/shared-models';
import {
  courseChoiceRefusal,
  holdsCoursePlace,
  isAnnouncedCourseOpen,
  toCourseOption,
  type PublicCourseOption,
} from '@okr/shared-util-core';

import { isDocumentId } from './form-section-config';
import type { ValueNames } from './submission-pipeline';

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

/**
 * Places taken on a course: applications of this tenant that hold a place (decided in code). No `isArchived`
 * filter in the query: form-submitted applications are written without that field, and `holdsCoursePlace`
 * already excludes `isArchived === true` — a `== false` filter would never count them (course never full).
 */
export async function countCoursePlaces(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  courseKey: string,
): Promise<number> {
  const snap = await db.collection('applications')
    .where('tenants', 'array-contains', tenantId)
    .where('courseKey', '==', courseKey)
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

// ──────────────────────────────────────────
// submitForm — the course choice (spec 1.152 §7.3)
// ──────────────────────────────────────────

/** The record fields a course choice writes. Never taken from the client: `applyCourseChoice` sets or removes both. */
const COURSE_KEY = 'courseKey';
const COURSE_STATE = 'courseState';

/**
 * The values with the course choice applied (pure): a key sets `courseKey` and `courseState: 'registered'`;
 * `''` removes both. Whatever the client sent under these keys is always replaced or dropped.
 */
export function applyCourseChoice(values: Record<string, unknown>, courseKey: string): Record<string, unknown> {
  const rest = { ...values };
  delete rest[COURSE_KEY];
  delete rest[COURSE_STATE];
  return courseKey !== '' ? { ...rest, [COURSE_KEY]: courseKey, [COURSE_STATE]: 'registered' } : rest;
}

/** The task note (a JSON dump of the values) gets the course name next to its key. Display only — never stored on the record. */
export function courseNameNote(values: Record<string, unknown>, names: ValueNames): Record<string, unknown> {
  const key = values[COURSE_KEY];
  const name = typeof key === 'string' ? names[COURSE_KEY]?.[key] : undefined;
  return name !== undefined ? { ...values, courseName: name } : values;
}

export interface CourseChoiceInput {
  fields: unknown;
  /** visible answers (`PreparedSubmission.answers`): a hidden course field has no answer */
  answers: Record<string, unknown>;
  /** server-computed derived values (`PreparedSubmission.derivedValues`) — never the client's */
  derivedValues: Record<string, string>;
  /** the clean values to be stored (`PreparedSubmission.values`) */
  values: Record<string, unknown>;
  tenantId: string;
  today: string;
  isSpam: boolean;
  /** the collection the submission is written to (`mapping.collectionName`), undefined for a mail/url target */
  targetCollection: string | undefined;
}

/** Only an application holds a course place (spec 1.152: course field only on `applications.*` mappings). */
const COURSE_TARGET = 'applications';

function courseUnavailable(): HttpsError {
  return new HttpsError('failed-precondition', 'course-unavailable', { reason: 'course-unavailable' });
}

/**
 * The server check of a course choice in `submitForm` (spec 1.152 §7.3, anti-goal §2): returns the values to
 * store, or throws `failed-precondition` / `course-unavailable`. Call it BEFORE a form slot is taken.
 *
 * - No course field on the form, or a spam-flagged submission: no check, and no course is stored — any
 *   client-sent `courseKey`/`courseState` is dropped.
 * - A course field on a target that is not an `applications` collection write (a definition bug): logged,
 *   no course stored, no refusal.
 * - The raw answer under the field's own key is never stored (only `courseKey` set here).
 * - Nothing ticked (A3) — no answer, `null` or `''`: a plain Anmeldung, nothing is read.
 * - Anything else that is not a document id (array, object, number, boolean, a path): refused unread.
 * - A key: the course is read on the server and must belong to the tenant, be announced, open, for the
 *   server-derived applicant type (`audienceFrom`) and not full (A6: counted before the write, not atomic).
 */
export async function checkCourseChoice(
  db: FirebaseFirestore.Firestore,
  input: CourseChoiceInput,
): Promise<Record<string, unknown>> {
  const field = courseFieldOf(input.fields);
  if (!field) return applyCourseChoice(input.values, '');
  // the raw answer is stored only as the checked `courseKey`, never under a differently named field key
  const values = { ...input.values };
  delete values[field.key];
  if (input.isSpam) return applyCourseChoice(values, '');
  if (input.targetCollection !== COURSE_TARGET) {
    logger.warn(`submitForm: course field '${field.key}' on a form not writing to '${COURSE_TARGET}' (target ${input.targetCollection ?? 'mail/url'}) — no course stored`);
    return applyCourseChoice(values, '');
  }
  const answer = input.answers[field.key];
  if (answer === undefined || answer === null || answer === '') return applyCourseChoice(values, '');
  if (!isDocumentId(answer) || answer.trim() !== answer) {
    logger.info(`submitForm: course choice refused (not a course key, ${Array.isArray(answer) ? 'array' : typeof answer})`);
    throw courseUnavailable();
  }
  const snap = await db.collection(CourseCollection).doc(answer).get();
  const course = snap.exists ? snap.data() as Partial<CourseModel> | undefined : undefined;
  const taken = course ? await countCoursePlaces(db, input.tenantId, answer) : 0;
  const audience = input.derivedValues[field.audienceFrom];
  if (courseChoiceRefusal(course, input.tenantId, audience, taken, input.today) !== undefined) {
    logger.info(`submitForm: course choice refused courseKey=${answer} audience=${audience ?? '-'} taken=${taken}`);
    throw courseUnavailable();
  }
  return applyCourseChoice(values, answer);
}
