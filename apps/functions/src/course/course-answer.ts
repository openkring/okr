// apps/functions/src/course/course-answer.ts
//
// Answering a course invitation from the email, without logging in (spec 1.152 §8.3, D3, D5, A9).
//
// The link is a capability: `c` (course), `a` (application) and `s` = HMAC(INVITATION_LINK_SECRET,
// c|a|'course'). The signature is checked BEFORE any read, so a forged or re-scoped link (an
// invitation `respond` or mailing signature over the same keys) costs no read and shows no data.
//
// GET never writes: mail scanners open every link, so the GET only shows the page with «Ich nehme
// teil» / «Ich nehme nicht teil». The POST from that page re-verifies the signature and, in one
// transaction, re-reads the application and the course, re-runs decideCourseAnswer and writes
// courseState + answeredAt. Nothing else changes (D3: no person, no membership). Then the course's
// responsible persons (else the group admins, A9) are told by push and mail; a failed notification
// never fails the answer.

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { projectID } from 'firebase-functions/params';
import { DocumentReference, getFirestore } from 'firebase-admin/firestore';

import { courseAnswerFunctionUrl, invitationLinkSecret, isAnswerChoice, verifyCourse } from '../calendar/answer-link';
import { brandOf, NO_TENANT_LINKS, notifyPersons, tenantLinks, TenantLinks } from '../calendar/deliver';
import { Brand } from '../calendar/mail';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import {
  COURSE_REFUSAL_TEXT,
  CourseAnswerPageParams,
  CourseAnswerRefusal,
  courseAnswerNotice,
  courseAnswerPage,
  courseAnswerPushBody,
  courseAnswerResultPage,
  courseAnswerResultText,
} from './course-mail';

const REGION = 'europe-west6';
const CF_NAME = 'courseAnswer';

/** The course states that came from an invitation — only those may answer. */
const ANSWERABLE_STATES = ['invited', 'accepted', 'declined'];

/** A refused or withdrawn application no longer answers (closed.approved still does). */
const REFUSED_APPLICATION_STATES = ['closed.denied', 'closed.cancelled'];

type Doc = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The application's tenant is one of the course's tenants. */
export function courseAnswerTenantOk(app: Doc | undefined, course: Doc | undefined): boolean {
  const tenantId = strings(app?.['tenants'])[0];
  return !!tenantId && !!course && strings(course['tenants']).includes(tenantId);
}

/**
 * Whether the application may still answer for `courseKey` (undefined = yes). The signature is
 * checked separately, before this. `today` is a Europe/Zurich StoreDate.
 */
export function decideCourseAnswer(app: Doc | undefined, course: Doc | undefined, courseKey: string, tenantOk: boolean, today: string): Exclude<CourseAnswerRefusal, 'invalid'> | undefined {
  if (!app || app['isArchived'] === true || !tenantOk) return 'not-found';
  if (REFUSED_APPLICATION_STATES.includes(str(app['state']))) return 'not-found';
  if (str(app['courseKey']) !== courseKey) return 'moved';
  if (!ANSWERABLE_STATES.includes(str(app['courseState']))) return 'not-found';
  if (!course || course['isArchived'] === true) return 'not-found';
  const lastDay = str(course['endDate']) || str(course['startDate']);
  if (lastDay && lastDay < today) return 'ended';
  return undefined;
}

/** The group's admins, only when the group belongs to the application's tenant (as invite-applicants). */
export function tenantGroupAdminKeys(group: Doc | undefined, tenantId: string): string[] {
  if (!group || !tenantId || !strings(group['tenants']).includes(tenantId)) return [];
  return [...new Set(strings(group['adminKeys']))];
}

/** Who hears about an answer: the course's responsible persons, else the admins of its group (A9). */
export async function courseNoticeRecipients(course: Doc, tenantId: string): Promise<string[]> {
  const responsible = (Array.isArray(course['responsiblePersons']) ? course['responsiblePersons'] : [])
    .map((p) => str((p as Doc | undefined)?.['key']))
    .filter(Boolean);
  if (responsible.length > 0) return [...new Set(responsible)];
  const groupKey = str(course['groupKey']);
  if (!groupKey) return [];
  const group = (await getFirestore().collection('groups').doc(groupKey).get()).data();
  return tenantGroupAdminKeys(group, tenantId);
}

/**
 * What the answer page (GET) shows. Only the first name, the course and its dates — never the last
 * name, e-mail, phone, date of birth or AHV number: whoever holds the link (a forwarded mail, a mail
 * scanner) sees this page.
 */
export function courseAnswerPageParams(brand: Brand, app: Doc, course: Doc, link: { postUrl: string; courseKey: string; applicationKey: string; signature: string }): CourseAnswerPageParams {
  return {
    ...brand,
    firstName: str(app['firstName']),
    courseName: str(course['name']),
    startDate: str(course['startDate']),
    endDate: str(course['endDate']),
    state: str(app['courseState']),
    postUrl: link.postUrl,
    courseKey: link.courseKey,
    applicationKey: link.applicationKey,
    signature: link.signature,
  };
}

/** GET reads the query (the email link), POST only the form body (the answer page). */
function param(req: { method: string; query: Record<string, unknown>; body?: Record<string, unknown> }, name: string): string {
  const value = req.method === 'POST' ? req.body?.[name] : req.query[name];
  return typeof value === 'string' ? value : '';
}

function todayZurich(): string {
  return toStoreDate(new Date());
}

/**
 * The write, in one transaction: re-read both documents and re-decide, since the course may have
 * been changed or the application moved since the page was shown. Returns the refusal when nothing
 * was written, otherwise the previous state (to skip a notice when nothing changed).
 */
async function recordCourseAnswer(appRef: DocumentReference, courseRef: DocumentReference, courseKey: string, state: 'accepted' | 'declined'): Promise<{ refusal: Exclude<CourseAnswerRefusal, 'invalid'> } | { previous: string; app: Doc; course: Doc }> {
  return getFirestore().runTransaction(async (tx) => {
    const [appSnap, courseSnap] = await Promise.all([tx.get(appRef), tx.get(courseRef)]);
    const app = appSnap.exists ? (appSnap.data() as Doc) : undefined;
    const course = courseSnap.exists ? (courseSnap.data() as Doc) : undefined;
    const refusal = decideCourseAnswer(app, course, courseKey, courseAnswerTenantOk(app, course), todayZurich());
    if (refusal || !app || !course) return { refusal: refusal ?? 'not-found' };
    tx.update(appRef, { courseState: state, answeredAt: toStoreDateTime(new Date()) });
    return { previous: str(app['courseState']), app, course };
  });
}

async function notifyResponsible(app: Doc, course: Doc, courseKey: string, tenantId: string, links: TenantLinks, state: 'accepted' | 'declined'): Promise<void> {
  try {
    const personKeys = await courseNoticeRecipients(course, tenantId);
    if (personKeys.length === 0) { logger.info(`${CF_NAME}: no responsible person or group admin to notify`); return; }
    const firstName = str(app['firstName']);
    const lastName = str(app['lastName']);
    const courseName = str(course['name']);
    const path = `/course/table/${encodeURIComponent(courseKey)}`;
    const notice = courseAnswerNotice({
      ...brandOf(links), firstName, lastName, courseName, answer: state,
      courseUrl: links.appUrl ? `${links.appUrl}${path}` : undefined,
    });
    await notifyPersons({
      personKeys, tenantId,
      push: {
        type: 'course', tenantId, title: courseName,
        body: courseAnswerPushBody(`${firstName} ${lastName}`.trim(), state),
        url: path,
        channelId: `course.${courseKey}.answer`,
      },
      email: () => notice,
      ruleKey: `course:${courseKey}`,
      context: CF_NAME,
    });
  } catch (err) {
    logger.warn(`${CF_NAME}: notifying the responsible persons failed`, err);
  }
}

export const courseAnswer = onRequest(
  { region: REGION, secrets: [invitationLinkSecret], cors: false },
  async (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'POST') { res.set('Allow', 'GET, POST'); res.status(405).send(''); return; }

    let brand: Brand = { appName: '' };
    try {
      const params = { method: req.method, query: req.query as Record<string, unknown>, body: req.body as Record<string, unknown> | undefined };
      const courseKey = param(params, 'c');
      const applicationKey = param(params, 'a');
      const signature = param(params, 's');

      // No read before the signature holds: a forged link learns nothing, not even the tenant.
      if (!courseKey || !applicationKey || !verifyCourse(courseKey, applicationKey, signature, invitationLinkSecret.value())) {
        res.status(403).send(courseAnswerResultPage({ ...brand, ...COURSE_REFUSAL_TEXT.invalid }));
        return;
      }

      const db = getFirestore();
      const appRef = db.collection('applications').doc(applicationKey);
      const courseRef = db.collection('courses').doc(courseKey);
      const [appSnap, courseSnap] = await Promise.all([appRef.get(), courseRef.get()]);
      const app = appSnap.exists ? (appSnap.data() as Doc) : undefined;
      const course = courseSnap.exists ? (courseSnap.data() as Doc) : undefined;
      const tenantId = strings(app?.['tenants'])[0] ?? '';
      const links = tenantId ? await tenantLinks(tenantId) : NO_TENANT_LINKS;
      brand = brandOf(links);

      const refuse = (reason: CourseAnswerRefusal, status = 200): void => {
        res.status(status).send(courseAnswerResultPage({ ...brand, ...COURSE_REFUSAL_TEXT[reason] }));
      };

      const refusal = decideCourseAnswer(app, course, courseKey, courseAnswerTenantOk(app, course), todayZurich());
      if (refusal || !app || !course) { refuse(refusal ?? 'not-found', refusal === 'not-found' || !refusal ? 404 : 200); return; }

      if (req.method === 'GET') {
        res.status(200).send(courseAnswerPage(courseAnswerPageParams(brand, app, course, {
          postUrl: courseAnswerFunctionUrl(projectID.value()), courseKey, applicationKey, signature,
        })));
        return;
      }

      const answer = param(params, 'answer');
      if (!isAnswerChoice(answer)) { refuse('invalid', 403); return; }
      const state = answer === 'accept' ? 'accepted' : 'declined';
      const outcome = await recordCourseAnswer(appRef, courseRef, courseKey, state);
      if ('refusal' in outcome) { refuse(outcome.refusal, outcome.refusal === 'not-found' ? 404 : 200); return; }
      logger.info(`${CF_NAME}: recorded ${state} for one application (tenant ${tenantId})`);

      // a repeated press of the same button changes nothing the responsible persons need to hear
      if (outcome.previous !== state) await notifyResponsible(outcome.app, outcome.course, courseKey, tenantId, links, state);

      res.status(200).send(courseAnswerResultPage({ ...brand, ...courseAnswerResultText(state) }));
    } catch (err) {
      // Never log the keys, the signature, or any name/email — only that it failed.
      logger.error(`${CF_NAME}: failed`, err);
      if (res.headersSent) return;
      res.status(500).send(courseAnswerResultPage({
        ...brand,
        title: 'Das hat nicht geklappt',
        message: 'Deine Antwort konnte nicht gespeichert werden. Versuch es bitte nochmals.',
      }));
    }
  },
);
