// apps/functions/src/course/invite-applicants.ts
//
// Inviting applicants to a course (spec 1.152 §8.1, §8.2, §11, D7, A4, A7).
//
// `applications` stay privileged-only in firestore.rules. A course manager who is not privileged (a responsible
// person, an admin of the course's group) reads them ONLY through these callables, filtered by D7:
// applicants already on the course plus open applicants whose `applicationAs` is in the course `audience`, and only
// name, type, age, course and state — never an address, AHV number, contact or form answer. Privileged users see all
// open applicants. No rules widening.
//
// - `listCourseApplicants({ courseKey })` → the rows of the invite dialog plus the place counts.
// - `inviteApplicantsToCourse({ courseKey, applicationKeys })` → mails the personal answer link (Task 10,
//   `courseAnswerUrl`) and sets `courseKey`, `courseState: 'invited'`, `invitedAt`, clears `answeredAt`. Every key
//   is re-checked against the same D7 visibility: a key the caller could not have seen is `not-found`.
// - `courseApplicantCounts({ courseKeys })` → places taken per course for the course list chip, one call per list
//   instead of one per row. Counted for courses the caller manages or that are announced (the public form shows
//   the free places of those anyway).
//
// Roles come from `users/{uid}.roles` — role claims are never minted. The tenant is the caller's
// `users/{uid}.tenants[0]`, and the course's `tenants` must include it.
//
// Applications are queried by `tenants` only (plus `courseKey` for the counts) and filtered in code: form
// submissions are written without `isArchived`, so a `== false` filter would silently drop them.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { ApplicationCourseState, ApplicationKind } from '@okr/shared-models';
import { DateFormat, getAge, getTodayStr, holdsCoursePlace } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import {
  courseHasEnded,
  INVITE_MAX_APPLICANTS,
  type CourseApplicantCountsResult,
  type CourseApplicantRow,
  type CourseApplicantsResult,
  type InviteApplicantsResult,
  type InviteSkipReason,
} from '@okr/calendar-course-util';

import { courseAnswerUrl, invitationLinkSecret } from '../calendar/answer-link';
import { brandOf, tenantLinks } from '../calendar/deliver';
import { getAppEmailConfig, getEmailProvider } from '../auth/email-templates';
import { sendEmailViaProvider } from '../auth/email-transport';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { courseInvitationMail } from './course-mail';

const REGION = 'europe-west6';
const MAIL_SECRETS = ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'];
/** Mails sent at the same time; 100 one after the other would take most of a minute. */
const MAIL_CONCURRENCY = 5;
/** Firestore `in` takes at most 30 values. */
const IN_LIMIT = 30;

const OPEN_STATES = ['applied', 'reviewing'];
const APPLICATION_KINDS: ApplicationKind[] = ['youth', 'adult', 'transfer'];
const COURSE_STATES: ApplicationCourseState[] = ['', 'registered', 'invited', 'accepted', 'declined'];

type Doc = Record<string, unknown>;
type KeyedDoc = Doc & { okey: string };

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A Firestore document id coming from the client: a non-empty string without a path separator. */
function isDocKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
}

function kindOf(app: Doc): ApplicationKind {
  const kind = str(app['applicationAs']) as ApplicationKind;
  return APPLICATION_KINDS.includes(kind) ? kind : 'adult';
}

function courseStateOf(app: Doc): ApplicationCourseState {
  const state = str(app['courseState']) as ApplicationCourseState;
  return COURSE_STATES.includes(state) ? state : '';
}

/*------------------------------------ pure rules ------------------------------------*/

/** `privileged` or `admin`, exactly `true` on `users/{uid}.roles` — the rules' `isPrivileged()`. */
export function isPrivilegedRoles(roles: Doc | undefined): boolean {
  return roles?.['privileged'] === true || roles?.['admin'] === true;
}

/**
 * The server twin of `mayManageCourse` (libs/calendar/course/util course-access.util.ts) and of `isCourseManager`
 * in firestore.rules: privileged, a responsible person of the course, or an admin of its group.
 * @param groupAdminKeys `groups/{course.groupKey}.adminKeys` (only when the group is in the caller's tenant)
 */
export function mayManageCourseServer(course: Doc, personKey: string, roles: Doc | undefined, groupAdminKeys: string[]): boolean {
  if (isPrivilegedRoles(roles)) return true;
  if (!personKey) return false;
  const responsible = (Array.isArray(course['responsiblePersons']) ? course['responsiblePersons'] : [])
    .some((p) => str((p as Doc | undefined)?.['key']) === personKey);
  return responsible || groupAdminKeys.includes(personKey);
}

/** Open = applied / reviewing and not archived (a missing `isArchived` is not archived). */
function isOpen(app: Doc): boolean {
  return app['isArchived'] !== true && OPEN_STATES.includes(str(app['state']));
}

/** D7, ignoring the state: privileged see everybody; others only those on the course or in its audience. */
function isVisibleTo(app: Doc, course: KeyedDoc, isPrivileged: boolean): boolean {
  if (isPrivileged) return true;
  if (str(app['courseKey']) === course.okey) return true;
  return strings(course['audience']).includes(kindOf(app));
}

/**
 * A non-privileged manager must not take an applicant away from ANOTHER course where they hold a place (A7): only a
 * privileged user may move them. `'on-other-course'` then, else ''.
 */
function lockFor(app: Doc, course: KeyedDoc, isPrivileged: boolean): '' | 'on-other-course' {
  if (isPrivileged) return '';
  const current = str(app['courseKey']);
  return current && current !== course.okey && holdsCoursePlace(app, current) ? 'on-other-course' : '';
}

/**
 * The rows of the invite dialog (D7): open applications the caller may see, as name, type, age, course and state
 * only, sorted by last and first name. The row is built field by field, so nothing else can leak into it. A row of
 * an applicant holding a place on another course is visible but locked for a non-privileged caller (`lockedReason`).
 * @param courseNames names of the courses the rows are on, by key (another course of the tenant shows its name)
 * @param refYear the year the age is computed for (by birth year, as the club counts)
 */
export function visibleApplicants(apps: KeyedDoc[], course: KeyedDoc, isPrivileged: boolean, courseNames: Record<string, string> = {}, refYear?: number): CourseApplicantRow[] {
  return apps
    .filter((app) => isOpen(app) && isVisibleTo(app, course, isPrivileged))
    .map((app) => {
      const courseKey = str(app['courseKey']);
      const dob = str(app['dateOfBirth']);
      const age = dob ? getAge(dob, false, refYear) : -1;
      return {
        key: app.okey,
        firstName: str(app['firstName']),
        lastName: str(app['lastName']),
        applicationAs: kindOf(app),
        age: age >= 0 ? age : null,
        courseKey,
        courseName: courseKey ? (courseNames[courseKey] ?? '') : '',
        courseState: courseKey ? courseStateOf(app) : '',
        lockedReason: lockFor(app, course, isPrivileged),
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de', { sensitivity: 'base' })
      || a.firstName.localeCompare(b.firstName, 'de', { sensitivity: 'base' }));
}

/**
 * Whether one application may be invited (undefined = yes). Missing, archived, another tenant, or not visible to
 * the caller (D7) → `not-found`; the visibility comes first, so a manager learns nothing about an applicant they
 * could not see. A closed application → `closed`. For a non-privileged caller, an applicant holding a place on
 * another course → `on-other-course` (only a privileged user may move them).
 */
export function decideInvite(app: Doc | undefined, tenantId: string, course: KeyedDoc, isPrivileged: boolean): 'not-found' | 'closed' | 'on-other-course' | undefined {
  if (!app || app['isArchived'] === true || !strings(app['tenants']).includes(tenantId)) return 'not-found';
  if (!isVisibleTo(app, course, isPrivileged)) return 'not-found';
  if (!OPEN_STATES.includes(str(app['state']))) return 'closed';
  if (lockFor(app, course, isPrivileged)) return 'on-other-course';
  return undefined;
}

/**
 * The fields of an error that are safe to log: a code and a provider response code, never the message (an SMTP or
 * Mailtrap error may quote the recipient address) and never the error object.
 */
export function safeErrorFields(err: unknown): { code?: string | number; responseCode?: number } {
  const e = (err ?? {}) as Doc;
  const fields: { code?: string | number; responseCode?: number } = {};
  if (typeof e['code'] === 'string' || typeof e['code'] === 'number') fields.code = e['code'];
  if (typeof e['responseCode'] === 'number') fields.responseCode = e['responseCode'];
  return fields;
}

/** What `inviteOneApplication` needs from the outside: sending the mail and writing the application. */
export type InviteDeps = {
  send: (recipients: { to: string; cc: string[] }, firstName: string) => Promise<void>;
  update: (fields: Doc) => Promise<void>;
  now: () => Date;
  log: (message: string, fields: Doc) => void;
};

/**
 * One application: decide, mail first, then write. Never throws, so one row can never abort the batch:
 * a failed mail → `mail-failed` (the application is unchanged); a failed write after the mail went out →
 * `write-failed` (the person got a link the answer page will refuse as «moved» / «not found»; invite again).
 * @returns undefined when invited, else the skip reason
 */
export async function inviteOneApplication(
  app: Doc | undefined, tenantId: string, course: KeyedDoc, isPrivileged: boolean, deps: InviteDeps,
): Promise<InviteSkipReason | undefined> {
  const refusal = decideInvite(app, tenantId, course, isPrivileged);
  if (refusal || !app) return refusal ?? 'not-found';
  const recipients = inviteRecipients(app);
  if (!recipients) return 'no-email';
  try {
    await deps.send(recipients, str(app['firstName']));
  } catch (err) {
    deps.log('the invitation mail to one applicant failed', safeErrorFields(err));
    return 'mail-failed';
  }
  try {
    await deps.update({ courseKey: course.okey, courseState: 'invited', invitedAt: toStoreDateTime(deps.now()), answeredAt: '' });
  } catch (err) {
    deps.log('the mail went out, but the application could not be updated', safeErrorFields(err));
    return 'write-failed';
  }
  return undefined;
}

function cleanEmail(value: unknown): string {
  const email = str(value).trim();
  return email.includes('@') ? email : '';
}

/**
 * TO / CC of the invitation, the rule of the application spec §6.2: TO the applicant's `email`; for youth, CC the
 * `parentEmail`, or TO the parent when the applicant gave none. `undefined` = no address at all (`no-email`).
 */
export function inviteRecipients(app: Doc): { to: string; cc: string[] } | undefined {
  const email = cleanEmail(app['email']);
  const parent = kindOf(app) === 'youth' ? cleanEmail(app['parentEmail']) : '';
  if (email) return { to: email, cc: parent && parent.toLowerCase() !== email.toLowerCase() ? [parent] : [] };
  if (parent) return { to: parent, cc: [] };
  return undefined;
}

/** The request of `inviteApplicantsToCourse`, checked: a course key and 1–100 distinct application keys. */
export function parseInviteRequest(data: unknown): { courseKey: string; applicationKeys: string[] } {
  const d = (data ?? {}) as Doc;
  const courseKey = d['courseKey'];
  if (!isDocKey(courseKey)) throw new HttpsError('invalid-argument', 'courseKey is required.');
  const raw = d['applicationKeys'];
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpsError('invalid-argument', 'applicationKeys must be a non-empty list.');
  if (!raw.every(isDocKey)) throw new HttpsError('invalid-argument', 'applicationKeys must be document keys.');
  const applicationKeys = [...new Set(raw as string[])];
  if (applicationKeys.length > INVITE_MAX_APPLICANTS) {
    throw new HttpsError('invalid-argument', `At most ${INVITE_MAX_APPLICANTS} applications per call.`);
  }
  return { courseKey, applicationKeys };
}

/*------------------------------------ I/O ------------------------------------*/

type Caller = { tenantId: string; personKey: string; roles: Doc; isPrivileged: boolean };

/** The caller's uid (after `checkAuthentication`). */
function uidOf(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'user must be authenticated.');
  return uid;
}

async function readCaller(db: Firestore, uid: string, cfName: string): Promise<Caller> {
  const user = (await db.collection('users').doc(uid).get()).data();
  const tenantId = strings(user?.['tenants'])[0] ?? '';
  if (!user || !tenantId) {
    logger.warn(`${cfName}: caller is not linked to a tenant`);
    throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
  }
  const roles = (user['roles'] as Doc | undefined) ?? {};
  return { tenantId, personKey: str(user['personKey']), roles, isPrivileged: isPrivilegedRoles(roles) };
}

/** The admins of a group in the caller's tenant ([] for another tenant's or a missing group). */
async function groupAdminKeys(db: Firestore, groupKey: string, tenantId: string): Promise<string[]> {
  if (!isDocKey(groupKey)) return [];
  const group = (await db.collection('groups').doc(groupKey).get()).data();
  return group && strings(group['tenants']).includes(tenantId) ? strings(group['adminKeys']) : [];
}

/** The course of the caller's tenant that the caller manages; throws `not-found` / `permission-denied`. */
async function readManagedCourse(db: Firestore, courseKey: string, caller: Caller, cfName: string): Promise<KeyedDoc> {
  const data = (await db.collection('courses').doc(courseKey).get()).data();
  if (!data || data['isArchived'] === true || !strings(data['tenants']).includes(caller.tenantId)) {
    throw new HttpsError('not-found', 'Course not found.');
  }
  const course: KeyedDoc = { ...data, okey: courseKey };
  const admins = caller.isPrivileged ? [] : await groupAdminKeys(db, str(course['groupKey']), caller.tenantId);
  if (!mayManageCourseServer(course, caller.personKey, caller.roles, admins)) {
    logger.warn(`${cfName}: caller may not manage the course`);
    throw new HttpsError('permission-denied', 'Only who manages the course may do this.');
  }
  return course;
}

async function tenantApplications(db: Firestore, tenantId: string): Promise<KeyedDoc[]> {
  const snap = await db.collection('applications').where('tenants', 'array-contains', tenantId).get();
  return snap.docs.map((d) => ({ ...d.data(), okey: d.id }));
}

/** Names of the given courses that belong to the tenant. */
async function courseNames(db: Firestore, keys: string[], tenantId: string): Promise<Record<string, string>> {
  const unique = [...new Set(keys)].filter(isDocKey);
  if (unique.length === 0) return {};
  const snaps = await db.getAll(...unique.map((k) => db.collection('courses').doc(k)));
  const names: Record<string, string> = {};
  for (const snap of snaps) {
    const data = snap.data();
    if (data && strings(data['tenants']).includes(tenantId)) names[snap.id] = str(data['name']);
  }
  return names;
}

/*------------------------------------ listCourseApplicants ------------------------------------*/

export const listCourseApplicants = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ courseKey?: unknown }>): Promise<CourseApplicantsResult> => {
    const cfName = 'listCourseApplicants';
    checkAppCheckToken(request as never, cfName);
    checkAuthentication(request as never, cfName);
    const courseKey = request.data?.courseKey;
    if (!isDocKey(courseKey)) throw new HttpsError('invalid-argument', 'courseKey is required.');

    const db = getFirestore();
    const caller = await readCaller(db, uidOf(request), cfName);
    const course = await readManagedCourse(db, courseKey, caller, cfName);
    const apps = await tenantApplications(db, caller.tenantId);

    const candidates = visibleApplicants(apps, course, caller.isPrivileged);
    const otherCourseKeys = candidates.map((r) => r.courseKey).filter((k) => k && k !== courseKey);
    const names = { ...(await courseNames(db, otherCourseKeys, caller.tenantId)), [courseKey]: str(course['name']) };
    const rows = visibleApplicants(apps, course, caller.isPrivileged, names);

    const holding = apps.filter((a) => holdsCoursePlace(a, courseKey));
    // counts only, no names (privacy inventory)
    logger.info(`${cfName}: ${rows.length} row(s) for one course (tenant ${caller.tenantId}, privileged ${caller.isPrivileged})`);
    return {
      rows,
      placesTaken: holding.length,
      maxParticipants: typeof course['maxParticipants'] === 'number' ? course['maxParticipants'] : 0,
      invited: holding.filter((a) => a['courseState'] === 'invited').length,
      accepted: holding.filter((a) => a['courseState'] === 'accepted').length,
    };
  },
);

/*------------------------------------ inviteApplicantsToCourse ------------------------------------*/

async function logInviteActivity(db: Firestore, tenantId: string, personKey: string, payload: Doc): Promise<void> {
  try {
    const timestamp = getTodayStr(DateFormat.StoreDateTime);
    await db.collection('activities').add({
      tenants: [tenantId],
      isArchived: false,
      timestamp,
      scope: 'course',
      action: 'invite-applicants',
      roleNeeded: 'privileged',
      payload: JSON.stringify(payload),
      author: { key: personKey, name1: '', name2: '', modelType: 'person', type: '', subType: '', label: '' },
      index: `t:${timestamp} c:course a:invite-applicants`,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.warn('inviteApplicantsToCourse: could not write the activity', safeErrorFields(err));
  }
}

export const inviteApplicantsToCourse = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 300, secrets: [invitationLinkSecret, ...MAIL_SECRETS] },
  async (request: CallableRequest<unknown>): Promise<InviteApplicantsResult> => {
    const cfName = 'inviteApplicantsToCourse';
    checkAppCheckToken(request as never, cfName);
    checkAuthentication(request as never, cfName);
    const { courseKey, applicationKeys } = parseInviteRequest(request.data);

    const db = getFirestore();
    const caller = await readCaller(db, uidOf(request), cfName);
    const course = await readManagedCourse(db, courseKey, caller, cfName);
    if (courseHasEnded({ startDate: str(course['startDate']), endDate: str(course['endDate']) }, toStoreDate(new Date()))) {
      throw new HttpsError('failed-precondition', 'course-ended', { reason: 'course-ended' });
    }

    const refs = applicationKeys.map((k) => db.collection('applications').doc(k));
    const snaps = await db.getAll(...refs);
    const [links, { from }, provider] = await Promise.all([
      tenantLinks(caller.tenantId), getAppEmailConfig(caller.tenantId), getEmailProvider(caller.tenantId),
    ]);
    const brand = brandOf(links);
    const secret = invitationLinkSecret.value();
    const projectId = projectID.value();

    const skipped: { key: string; reason: InviteSkipReason }[] = [];
    let invited = 0;

    const inviteOne = async (index: number): Promise<void> => {
      const key = applicationKeys[index];
      const snap = snaps[index];
      const reason = await inviteOneApplication(snap.exists ? (snap.data() as Doc) : undefined, caller.tenantId, course, caller.isPrivileged, {
        send: async (recipients, firstName) => {
          const { subject, html } = courseInvitationMail({
            ...brand,
            firstName,
            courseName: str(course['name']),
            startDate: str(course['startDate']),
            endDate: str(course['endDate']),
            answerUrl: courseAnswerUrl(projectId, courseKey, key, secret),
          });
          await sendEmailViaProvider(provider, { from, to: [recipients.to], cc: recipients.cc, subject, html });
        },
        update: async (fields) => { await refs[index].update(fields); },
        now: () => new Date(),
        // never an address, a key or an error message in the log
        log: (message, fields) => logger.warn(`${cfName}: ${message}`, fields),
      });
      if (reason) skipped.push({ key, reason });
      else invited += 1;
    };

    for (let i = 0; i < applicationKeys.length; i += MAIL_CONCURRENCY) {
      await Promise.all(applicationKeys.slice(i, i + MAIL_CONCURRENCY).map((_, j) => inviteOne(i + j)));
    }

    // keep the caller's order in the response
    const order = new Map(applicationKeys.map((k, i) => [k, i]));
    skipped.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));

    const counts = skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {});
    logger.info(`${cfName}: ${invited} invited, ${skipped.length} skipped (tenant ${caller.tenantId})`);
    await logInviteActivity(db, caller.tenantId, caller.personKey, { courseKey, invited, skipped: counts });
    return { invited, skipped };
  },
);

/*------------------------------------ courseApplicantCounts ------------------------------------*/

export const courseApplicantCounts = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ courseKeys?: unknown }>): Promise<CourseApplicantCountsResult> => {
    const cfName = 'courseApplicantCounts';
    checkAppCheckToken(request as never, cfName);
    checkAuthentication(request as never, cfName);
    const raw = request.data?.courseKeys;
    if (!Array.isArray(raw) || !raw.every(isDocKey) || raw.length > INVITE_MAX_APPLICANTS) {
      throw new HttpsError('invalid-argument', `courseKeys must be up to ${INVITE_MAX_APPLICANTS} document keys.`);
    }
    const keys = [...new Set(raw as string[])];
    if (keys.length === 0) return { counts: {} };

    const db = getFirestore();
    const caller = await readCaller(db, uidOf(request), cfName);
    const snaps = await db.getAll(...keys.map((k) => db.collection('courses').doc(k)));
    const adminsByGroup = new Map<string, Promise<string[]>>();
    const admins = (groupKey: string): Promise<string[]> => {
      const known = adminsByGroup.get(groupKey);
      if (known) return known;
      const loading = groupAdminKeys(db, groupKey, caller.tenantId);
      adminsByGroup.set(groupKey, loading);
      return loading;
    };

    const countable: string[] = [];
    for (const snap of snaps) {
      const course = snap.data();
      if (!course || !strings(course['tenants']).includes(caller.tenantId)) continue;
      const announced = course['isAnnounced'] === true;
      if (announced || caller.isPrivileged
        || mayManageCourseServer(course, caller.personKey, caller.roles, await admins(str(course['groupKey'])))) {
        countable.push(snap.id);
      }
    }

    const counts: Record<string, number> = Object.fromEntries(countable.map((k) => [k, 0]));
    for (let i = 0; i < countable.length; i += IN_LIMIT) {
      const slice = countable.slice(i, i + IN_LIMIT);
      // index: applications tenants (array-contains) + courseKey
      const snap = await db.collection('applications')
        .where('tenants', 'array-contains', caller.tenantId)
        .where('courseKey', 'in', slice)
        .get();
      for (const doc of snap.docs) {
        const app = doc.data();
        const key = str(app['courseKey']);
        if (key in counts && holdsCoursePlace(app, key)) counts[key] += 1;
      }
    }
    return { counts };
  },
);
