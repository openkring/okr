// apps/functions/src/course/course-end-tasks.ts
//
// Nightly job `courseEndTasks` (spec 1.132 §7.5): once a course has ended, its responsible person gets
// one task «Kurs abschliessen: <Name>» that links to the course table and names the three closing steps.
//
// Idempotent twice over: the task okey is deterministic (`course-<key>-end`, so a second `create` fails with
// ALREADY_EXISTS instead of making a second task) and the course records it in `endTaskKey` in the same batch,
// which the query side of the job then skips.

import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { addDuration, DateFormat, getTodayStr, isAfterDate, publicAppOrigin } from '@okr/shared-util-core';
import type { AvatarInfo, CourseModel } from '@okr/shared-models';

const COURSE_COLLECTION = 'courses';
const TASK_COLLECTION = 'tasks';
const GROUP_COLLECTION = 'groups';
const APP_CONFIG_COLLECTION = 'app-config';
/** The task is due this many days after the job creates it (spec 1.132 §7.5). */
const DUE_DAYS = 14;
const GRPC_ALREADY_EXISTS = 6;

/** A course as read off Firestore: `okey` is the doc id, fields added later may be absent on legacy docs. */
export type CourseDoc = CourseModel & { okey: string };

/**
 * The courses that still need their end task: ended strictly before `today` (the end day itself is part of
 * the course), not archived, no `endTaskKey` yet. A missing responsible person does NOT exclude a course —
 * the runner then falls back to a group admin. Firestore cannot query "field absent or empty", so the
 * `endTaskKey`/`endDate` emptiness checks live here rather than in the query.
 */
export function coursesNeedingEndTask(courses: CourseDoc[], today: string): CourseDoc[] {
  return courses.filter((course) =>
    !course.isArchived
    && !!course.endDate
    && !(course.endTaskKey ?? '')
    && isAfterDate(today, course.endDate),
  );
}

/** `/course/table/:courseKey` under the tenant's public origin — the page the three closing steps happen on. */
function courseTableUrl(appUrl: string, courseKey: string): string {
  return `${appUrl}/course/table/${courseKey}`;
}

/** German fixed copy (du-form, lower-case du), spec §7.5: attendance, report, compensation. */
function endTaskNotes(course: CourseDoc, appUrl: string): string {
  return [
    `Der Kurs «${course.name}» ist zu Ende. Schliesse ihn bitte in diesen drei Schritten ab:`,
    '',
    '1. Prüfe die Anwesenheit in der Kurstabelle.',
    '2. Melde den Kurs (Export aus der Kurstabelle).',
    '3. Beantrage die Entschädigung für die Trainerinnen und Trainer.',
    '',
    `Kurstabelle: ${courseTableUrl(appUrl, course.okey)}`,
  ].join('\n');
}

/**
 * The end task of one course, ready to `create()` under `tasks/<okey>`. Pure. The assignee is the first
 * responsible person unless the caller passes another one (the group-admin fallback).
 */
export function buildCourseEndTask(
  course: CourseDoc,
  appUrl: string,
  today: string,
  assignee: AvatarInfo | undefined = course.responsiblePersons?.[0],
): { okey: string; doc: Record<string, unknown> } {
  const linkKey = `course.${course.okey}`;
  return {
    okey: `course-${course.okey}-end`,
    doc: {
      tenants: [course.tenants?.[0] ?? ''],
      isArchived: false,
      name: `Kurs abschliessen: ${course.name}`.slice(0, 200),
      index: '',
      tags: '',
      notes: endTaskNotes(course, appUrl),
      author: null,
      assignee: assignee ?? null,
      state: 'initial',
      dueDate: addDuration(today, { days: DUE_DAYS }),
      completionDate: '',
      priority: 'medium',
      importance: 'medium',
      calendars: [],
      rank: '',
      shareKey: '',
      parentKey: '',
      relatedModelType: '',
      relatedKey: '',
      linkModelType: 'course',
      linkKey,
      links: [],
    },
  };
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === GRPC_ALREADY_EXISTS || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

/** Creates the end task of every given course (assignee fallback, idempotent). Returns how many courses got their `endTaskKey`. */
export async function createCourseEndTasks(db: Firestore, courses: CourseDoc[], today: string): Promise<number> {
  const groupAdmins = new Map<string, AvatarInfo | undefined>();
  const appUrls = new Map<string, string>();

  const firstGroupAdmin = async (groupKey: string): Promise<AvatarInfo | undefined> => {
    if (!groupKey) return undefined;
    if (!groupAdmins.has(groupKey)) {
      const group = (await db.collection(GROUP_COLLECTION).doc(groupKey).get()).data();
      groupAdmins.set(groupKey, ((group?.['admins'] as AvatarInfo[] | undefined) ?? []).find((a) => !!a?.key));
    }
    return groupAdmins.get(groupKey);
  };

  const appUrlOf = async (tenantId: string): Promise<string> => {
    if (!appUrls.has(tenantId)) {
      const cfg = (await db.collection(APP_CONFIG_COLLECTION).doc(tenantId).get()).data();
      appUrls.set(tenantId, publicAppOrigin(cfg?.['appDomain'] as string | undefined, tenantId));
    }
    return appUrls.get(tenantId) ?? '';
  };

  let done = 0;
  for (const course of courses) {
    try {
      const tenantId = course.tenants?.[0] ?? '';
      if (!tenantId) {
        logger.warn(`courseEndTasks: course ${course.okey} has no tenant — skipped`);
        continue;
      }
      const responsible = course.responsiblePersons?.find((p) => !!p?.key);
      const assignee = responsible ?? await firstGroupAdmin(course.groupKey);
      if (!assignee) {
        logger.warn(`courseEndTasks: course ${course.okey} has no responsible person and its group has no admin — skipped`);
        continue;
      }
      const task = buildCourseEndTask(course, await appUrlOf(tenantId), today, assignee);
      const courseRef = db.collection(COURSE_COLLECTION).doc(course.okey);
      try {
        const batch = db.batch();
        batch.create(db.collection(TASK_COLLECTION).doc(task.okey), task.doc);
        batch.update(courseRef, { endTaskKey: task.okey });
        await batch.commit();
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        // An earlier run created the task but died before the course update: just record the key.
        await courseRef.update({ endTaskKey: task.okey });
      }
      done += 1;
    } catch (error) {
      logger.error(`courseEndTasks: course ${course.okey} failed`, error);   // one course never stops the others
    }
  }
  return done;
}

/**
 * Runs in the nightly slot (03:15 Europe/Zurich = 01:15/02:15 UTC, the same calendar day in both zones), so
 * `getTodayStr()` — the container's UTC date — is the Zurich day this job acts on; same as `runTaskDaily`.
 */
export async function runCourseEndTasks(): Promise<void> {
  const db = getFirestore();
  const today = getTodayStr(DateFormat.StoreDate);
  const snap = await db.collection(COURSE_COLLECTION)
    .where('isArchived', '==', false)
    .where('endDate', '<', today)
    .get();
  const courses = snap.docs.map((d) => ({ ...(d.data() as Omit<CourseDoc, 'okey'>), okey: d.id }));
  const due = coursesNeedingEndTask(courses, today);
  const created = await createCourseEndTasks(db, due, today);
  logger.info(`courseEndTasks: candidates=${courses.length} due=${due.length} created=${created}`);
}
