// apps/functions/src/course/request-compensation.ts
//
// Callable `requestCourseCompensation` (spec 1.132 §7.6): a responsible person of a locked course asks for the
// trainers' compensation. Mirrors the OCR expense flow (accounting skill, ocr-and-expenses.md): one `forReview`
// booking per trainer (debit the compensation expense account, credit `employeePayablesAccountKey`, `bookingNo` 0)
// and one review task for the treasurer. The treasurer's approval in the journal (`reviewBooking`) IS the release
// (D13); the payment happens outside Kring (D6).
//
// Re-request semantics (§7.6 step 6, `planCompensationBookings`):
// - a `posted` booking is never touched; the response reports posted vs computed (Kring does not correct it);
// - a `draft`/`forReview` booking is overwritten, a `cancelled` one (rejected by the treasurer) is rewritten;
// - amount 0 writes nothing; an open (`draft`/`forReview`) booking left from an earlier request is CANCELLED with a
//   note (not deleted): approving it would pay trainings the new count no longer contains, and a cancelled booking
//   keeps the trail and counts in no report. The same applies to the open booking of a person who is no longer in
//   `eligible`.
//
// Narrowed against §7.6 (plan decisions): no voucher file in v1 — the treasurer reads the course table through the
// task link. Books that are not native are REFUSED (`failed-precondition`, reason `not-native-books`) instead of the
// task-only path of D14: the books are read-only there and the controller ruled out any write for them.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldPath, getFirestore, type Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { convertDateFormatToString, DateFormat, publicAppOrigin } from '@okr/shared-util-core';
import { CourseFinanceDocId, CourseFinanceSubcollection, MoneyModel, type AvatarInfo, type BookingStatus, type CalEventModel, type CourseEligible, type CourseFinanceModel } from '@okr/shared-models';
import { computeCompensation, unlistedLeaders, type CompensationLine } from '@okr/calendar-course-util';

import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { resolveTreasurer } from '../ocr/resolve-treasurer';
import { zurichDateTimeParts } from '../trip';

const REGION = 'europe-west6';
const CF_NAME = 'requestCourseCompensation';

const USERS_COLLECTION = 'users';
const COURSE_COLLECTION = 'courses';
const GROUP_COLLECTION = 'groups';
const CALEVENT_COLLECTION = 'calevents';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const APP_CONFIG_COLLECTION = 'app-config';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const TASK_COLLECTION = 'tasks';

// ---------------------------------------------------------------------------------------------------------------
// Pure part
// ---------------------------------------------------------------------------------------------------------------

/** A compensation booking already in the ledger: its status, its debit total (minor units) and its trainer. */
export type ExistingBooking = { okey: string; status: BookingStatus; amount: number; personKey?: string };

export type CompensationPlan = {
  /** lines that get a fresh `forReview` booking (new, or replacing a draft/forReview/cancelled one) */
  write: CompensationLine[];
  /** lines whose booking is already posted: left alone, the posted amount is reported against the computed one */
  keep: { line: CompensationLine; posted: number }[];
  /** lines with amount 0 and no posted booking: nothing is written */
  skipped: CompensationLine[];
  /** okeys of open (draft/forReview) bookings that are no longer owed: amount 0 now, or the person left `eligible` */
  retire: string[];
  /** posted bookings of persons no longer in `eligible`: reported with computed 0 */
  strayPosted: ExistingBooking[];
};

/** The deterministic booking okey of one trainer's compensation for one course (§7.6 step 3). */
export function compensationBookingKey(courseKey: string, personKey: string): string {
  return `course-${courseKey}-${personKey}`;
}

/** The deterministic okey of the treasurer's review task (one per course; a re-request rewrites it). */
export function compensationTaskKey(courseKey: string): string {
  return `course-${courseKey}-compensation`;
}

const isOpen = (status: BookingStatus): boolean => status === 'draft' || status === 'forReview';

/**
 * What a (re-)request writes, keeps, skips and retires. `existing` holds the course's compensation bookings by okey
 * (also those of persons no longer in `lines`). A posted booking always wins: it is kept, even for amount 0.
 */
export function planCompensationBookings(lines: CompensationLine[], existing: Record<string, ExistingBooking>, courseKey: string): CompensationPlan {
  const plan: CompensationPlan = { write: [], keep: [], skipped: [], retire: [], strayPosted: [] };
  const lineKeys = new Set<string>();
  for (const line of lines) {
    const okey = compensationBookingKey(courseKey, line.person.key);
    lineKeys.add(okey);
    const booking = existing[okey];
    if (booking?.status === 'posted') {
      plan.keep.push({ line, posted: booking.amount });
    } else if (line.amount <= 0) {
      plan.skipped.push(line);
      if (booking && isOpen(booking.status)) plan.retire.push(okey);
    } else {
      plan.write.push(line);
    }
  }
  for (const booking of Object.values(existing)) {
    if (lineKeys.has(booking.okey)) continue;
    if (booking.status === 'posted') plan.strayPosted.push(booking);
    else if (isOpen(booking.status)) plan.retire.push(booking.okey);
  }
  return plan;
}

/** Person keys that appear more than once in `eligible` (an empty key counts as invalid and is listed too). */
export function duplicateEligibleKeys(eligible: Pick<CourseEligible, 'person'>[]): string[] {
  const seen = new Set<string>();
  const result = new Set<string>();
  for (const { person } of eligible) {
    const key = person?.key ?? '';
    if (key === '' || seen.has(key)) result.add(key);
    seen.add(key);
  }
  return [...result];
}

/** The finance doc as read off Firestore, with every field a legacy or partial doc lacks filled in. */
export function coalesceFinance(raw: Partial<CourseFinanceModel> | undefined): CourseFinanceModel {
  return {
    accountingTenantId: raw?.accountingTenantId ?? '',
    accountKey: raw?.accountKey ?? '',
    costCenterKey: raw?.costCenterKey ?? '',
    defaultRate: raw?.defaultRate ?? new MoneyModel(0),
    eligible: raw?.eligible ?? [],
    requestedAt: raw?.requestedAt ?? '',
    requestedBy: raw?.requestedBy,
  };
}

/** 'CHF 50.00' — minor units to a display amount (same rendering as the OCR task params). */
function formatMoney(amount: number, currency: string): string {
  return `${currency || 'CHF'} ${(amount / 100).toFixed(2)}`;
}

function viewDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

/** `Trainerentschädigung <Kurs> <dd.MM.yyyy>–<dd.MM.yyyy>: <n> × <Ansatz>` (brief, step 6). */
export function compensationBookingTitle(courseName: string, startDate: string, endDate: string, line: CompensationLine): string {
  return `Trainerentschädigung ${courseName} ${viewDate(startDate)}–${viewDate(endDate)}: ${line.ledCount} × ${formatMoney(line.rate.amount, line.rate.currency)}`;
}

function personLabel(p: AvatarInfo | undefined): string {
  return (p?.label || `${p?.name1 ?? ''} ${p?.name2 ?? ''}`.trim() || p?.key) ?? '';
}

/** The review task's notes: per trainer count × rate, posted bookings left alone, unlisted leaders, the link. */
export function compensationTaskNotes(input: {
  courseName: string; requestedBy: AvatarInfo; lines: CompensationLine[]; plan: CompensationPlan;
  unlisted: AvatarInfo[]; courseUrl: string;
}): string {
  const { plan } = input;
  const out = [`${personLabel(input.requestedBy)} beantragt die Trainerentschädigung für den Kurs «${input.courseName}».`, ''];
  out.push('Entwürfe zur Prüfung im Journal:');
  if (plan.write.length === 0) out.push('- keine');
  for (const l of plan.write) {
    out.push(`- ${personLabel(l.person)}: ${l.ledCount} × ${formatMoney(l.rate.amount, l.rate.currency)} = ${formatMoney(l.amount, l.rate.currency)}`);
  }
  if (plan.keep.length + plan.strayPosted.length > 0) {
    out.push('', 'Bereits gebucht (Kring ändert diese Buchungen nicht):');
    for (const k of plan.keep) {
      out.push(`- ${personLabel(k.line.person)}: gebucht ${formatMoney(k.posted, k.line.rate.currency)}, neu berechnet ${formatMoney(k.line.amount, k.line.rate.currency)}`);
    }
    for (const s of plan.strayPosted) {
      out.push(`- ${s.okey}: gebucht ${formatMoney(s.amount, 'CHF')}, nicht mehr berechtigt`);
    }
  }
  if (input.unlisted.length > 0) {
    out.push('', `Geleitet, aber nicht als berechtigt erfasst: ${input.unlisted.map(personLabel).join(', ')}`);
  }
  out.push('', `Kurstabelle: ${input.courseUrl}`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------------------------

export interface RequestCourseCompensationData { courseKey: string; accountingTenantId: string }
export interface RequestCourseCompensationResult {
  written: number;
  kept: { personKey: string; posted: number; computed: number }[];
  taskKey: string;
  /** persons who led a counted training but are not in `eligible` (§7.6 marker) */
  unlistedKeys: string[];
}

function fail(code: 'failed-precondition' | 'invalid-argument' | 'permission-denied' | 'not-found', message: string, reason: string): never {
  throw new HttpsError(code, message, { reason });
}

const isDocKey = (key: unknown): key is string => typeof key === 'string' && key !== '' && !key.includes('/');

function avatarOfUser(personKey: string, user: Record<string, unknown>): AvatarInfo {
  const name1 = (user['firstName'] as string | undefined) ?? '';
  const name2 = (user['lastName'] as string | undefined) ?? '';
  return { key: personKey, name1, name2, modelType: 'person', type: '', subType: '', label: `${name1} ${name2}`.trim() };
}

/** Debit total of a booking's lines (minor units) — a balanced booking's amount. */
function debitTotal(lines: Record<string, unknown>[]): number {
  return lines.reduce((sum, l) => sum + Number((l['debitAmount'] as { amount?: number } | null | undefined)?.amount ?? 0), 0);
}

/**
 * The work of the callable, with Firestore and the clock injected (testable without the emulator). Authorisation is
 * checked here, independent of firestore.rules: course responsible (stored `responsibleKeys`), admin of the course's
 * group in the caller's tenant, or `privileged`/`admin`.
 */
export async function requestCompensation(db: Firestore, uid: string, data: RequestCourseCompensationData, now: Date): Promise<RequestCourseCompensationResult> {
  const courseKey = data?.courseKey;
  const accountingTenantId = data?.accountingTenantId;
  if (!isDocKey(courseKey)) fail('invalid-argument', 'courseKey is required', 'invalid-course-key');
  // The books come ONLY from the request — never defaulted from the app tenant (accounting skill).
  if (!isDocKey(accountingTenantId)) fail('invalid-argument', 'accountingTenantId is required', 'missing-books');

  // ---- caller ----
  const user = (await db.collection(USERS_COLLECTION).doc(uid).get()).data() ?? {};
  const tenantId = ((user['tenants'] as string[] | undefined) ?? [])[0] ?? '';
  if (!tenantId) fail('failed-precondition', 'User is not linked to a tenant.', 'no-tenant');
  const personKey = (user['personKey'] as string | undefined) ?? '';
  const roles = (user['roles'] as Record<string, unknown> | undefined) ?? {};

  // ---- course + authorisation ----
  const courseRef = db.collection(COURSE_COLLECTION).doc(courseKey);
  const course = (await courseRef.get()).data();
  if (!course) fail('not-found', `course ${courseKey} not found`, 'course-not-found');
  if (!((course['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    fail('permission-denied', 'course belongs to another tenant', 'course-other-tenant');
  }
  const isPrivileged = roles['privileged'] === true || roles['admin'] === true;
  const isResponsible = personKey !== '' && ((course['responsibleKeys'] as string[] | undefined) ?? []).includes(personKey);
  let isGroupAdmin = false;
  const groupKey = (course['groupKey'] as string | undefined) ?? '';
  if (!isPrivileged && !isResponsible && personKey !== '' && isDocKey(groupKey)) {
    const group = (await db.collection(GROUP_COLLECTION).doc(groupKey).get()).data();
    isGroupAdmin = !!group
      && ((group['tenants'] as string[] | undefined) ?? []).includes(tenantId)
      && ((group['adminKeys'] as string[] | undefined) ?? []).includes(personKey);
  }
  if (!isPrivileged && !isResponsible && !isGroupAdmin) {
    fail('permission-denied', 'only a responsible person, a group admin or a privileged user may request the compensation', 'not-course-manager');
  }
  // Frozen course: the numbers are stable, and freezing requires every past event to be confirmed (§7.8).
  if (course['isLocked'] !== true) fail('failed-precondition', 'the course must be locked first', 'course-not-locked');

  // ---- finance doc + books ----
  const financeRef = courseRef.collection(CourseFinanceSubcollection).doc(CourseFinanceDocId);
  const financeSnap = await financeRef.get();
  if (!financeSnap.exists) fail('failed-precondition', 'the course has no compensation settings', 'no-finance');
  const finance = coalesceFinance(financeSnap.data() as Partial<CourseFinanceModel>);
  if (finance.accountingTenantId !== accountingTenantId) {
    fail('invalid-argument', `the course is settled in the books ${finance.accountingTenantId || '(none)'}, not ${accountingTenantId}`, 'books-mismatch');
  }
  const config = (await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get()).data();
  if (!config) fail('failed-precondition', `no accounting settings for the books ${accountingTenantId}`, 'no-accounting-config');
  if (!((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    fail('permission-denied', 'the books belong to another tenant', 'books-other-tenant');
  }
  if ((config['accountingBackend'] ?? 'native') !== 'native') {
    fail('failed-precondition', 'these books are kept outside Kring; no compensation bookings can be written', 'not-native-books');
  }
  const duplicates = duplicateEligibleKeys(finance.eligible);
  if (duplicates.length > 0) fail('invalid-argument', `a person is listed more than once: ${duplicates.join(', ')}`, 'duplicate-eligible');

  // ---- compute (server side, §7.6 step 2) ----
  const eventSnap = await db.collection(CALEVENT_COLLECTION).where('courseKey', '==', courseKey).get();
  // single-field equality (auto-indexed); the tenant filter runs here, courseEvents() drops archived/cancelled
  const events = eventSnap.docs
    .map(d => ({ ...(d.data() as CalEventModel), okey: d.id }))
    .filter(e => (e.tenants ?? []).includes(tenantId));
  const lines = computeCompensation(events, finance);
  const unlisted = unlistedLeaders(events, finance);

  // ---- accounts (only needed when something is owed) ----
  const debitAccountKey = finance.accountKey || ((config['defaultCompensationAccountKey'] as string | undefined) ?? '');
  const creditAccountKey = (config['employeePayablesAccountKey'] as string | undefined) ?? '';
  const anythingOwed = lines.some(l => l.amount > 0);
  if (anythingOwed && (!debitAccountKey || !creditAccountKey)) {
    fail('failed-precondition', !debitAccountKey
      ? 'no compensation account: set one on the course or a default in the accounting settings'
      : 'no employee payables account in the accounting settings', 'missing-account');
  }
  const ccCtx = anythingOwed ? await loadCostCenterContext(db, tenantId, accountingTenantId, [debitAccountKey, creditAccountKey]) : undefined;
  const debitCostCenterKey = ccCtx ? costCenterKeyForLine(ccCtx, debitAccountKey, { explicit: finance.costCenterKey }) : '';

  // ---- task inputs (queries: before the transaction) ----
  const treasurer = await resolveTreasurer(tenantId, (config['reviewAssigneePersonKey'] as string | undefined) ?? '');
  const appConfig = (await db.collection(APP_CONFIG_COLLECTION).doc(tenantId).get()).data();
  const courseUrl = `${publicAppOrigin(appConfig?.['appDomain'] as string | undefined, tenantId)}/course/table/${courseKey}`;

  const { date: today, time } = zurichDateTimeParts(now);
  const requestedAt = `${today}${time.replace(':', '')}00`;   // StoreDateTime yyyyMMddHHmmss, Zurich wall clock
  const requestedBy = avatarOfUser(personKey, user);
  const courseName = (course['name'] as string | undefined) ?? '';
  const startDate = (course['startDate'] as string | undefined) ?? '';
  const endDate = (course['endDate'] as string | undefined) ?? '';
  const taskKey = treasurer?.key ? compensationTaskKey(courseKey) : '';

  const prefix = compensationBookingKey(courseKey, '');
  const result = await db.runTransaction(async (tx) => {
    // ---- reads (all before the first write) ----
    // Exact refs of the current lines, plus every booking of this course (okey prefix) for persons who left
    // `eligible`. A prefix hit only counts when its okey is exactly course-<key>-<counterparty.key>: course
    // `c1-x` shares the prefix of course `c1`.
    const lineRefs = lines.map(l => db.collection(BOOKING_COLLECTION).doc(compensationBookingKey(courseKey, l.person.key)));
    const exactSnaps = lineRefs.length ? await tx.getAll(...lineRefs) : [];
    const rangeSnap = await tx.get(db.collection(BOOKING_COLLECTION)
      .where(FieldPath.documentId(), '>=', prefix)
      .where(FieldPath.documentId(), '<', `${prefix}`));
    const bookingDocs = new Map<string, Record<string, unknown>>();
    for (const s of exactSnaps) if (s.exists) bookingDocs.set(s.id, s.data() ?? {});
    for (const s of rangeSnap.docs) {
      const counterpartyKey = (s.data()['counterparty'] as AvatarInfo | undefined)?.key ?? '';
      if (!bookingDocs.has(s.id) && counterpartyKey && s.id === compensationBookingKey(courseKey, counterpartyKey)) bookingDocs.set(s.id, s.data());
    }
    const existing: Record<string, ExistingBooking> = {};
    const existingLineRefs = new Map<string, FirebaseFirestore.DocumentReference[]>();
    for (const [okey, b] of bookingDocs) {
      const lineSnap = await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', okey));
      existingLineRefs.set(okey, lineSnap.docs.map(d => d.ref));
      existing[okey] = {
        okey, status: (b['status'] as BookingStatus | undefined) ?? 'draft',
        amount: debitTotal(lineSnap.docs.map(d => d.data())),
        personKey: (b['counterparty'] as AvatarInfo | undefined)?.key,
      };
    }
    const plan = planCompensationBookings(lines, existing, courseKey);

    // ---- writes ----
    for (const line of plan.write) {
      const okey = compensationBookingKey(courseKey, line.person.key);
      const debitRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${okey}-d`);
      const creditRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${okey}-c`);
      // lines of the replaced booking under other ids (none today; a treasurer correction would make some)
      for (const ref of existingLineRefs.get(okey) ?? []) {
        if (ref.id !== debitRef.id && ref.id !== creditRef.id) tx.delete(ref);
      }
      const createdAt = (bookingDocs.get(okey)?.['createdAt'] as string | undefined) ?? '';
      tx.set(db.collection(BOOKING_COLLECTION).doc(okey), {
        tenants: [tenantId], isArchived: false, index: '', tags: '',
        title: compensationBookingTitle(courseName, startDate, endDate, line).slice(0, 200),
        date: today,               // the request day (§7.6 step 3): a season over 31.12. gives one booking
        bookingNo: 0,              // forReview bookings are unnumbered; reviewBooking numbers them on approval
        periodKey: '', documentKey: '', documentKeys: [],
        status: 'forReview', accountingTenantId,
        counterparty: line.person,
        notes: '',
        ...(createdAt ? { createdAt } : {}),   // a rewrite keeps the trigger-stamped creation time
      });
      const currency = line.rate.currency || 'CHF';
      tx.set(debitRef, {
        tenants: [tenantId], isArchived: false,
        bookingKey: okey, accountKey: debitAccountKey,
        ...(debitCostCenterKey ? { costCenterKey: debitCostCenterKey } : {}),
        debitAmount: { amount: line.amount, currency, periodicity: 'one-time' },
        accountingTenantId,
      });
      tx.set(creditRef, {
        tenants: [tenantId], isArchived: false,
        bookingKey: okey, accountKey: creditAccountKey,
        creditAmount: { amount: line.amount, currency, periodicity: 'one-time' },
        accountingTenantId,
      });
    }
    for (const okey of plan.retire) {
      const old = ((bookingDocs.get(okey)?.['notes'] as string | undefined) ?? '').trim();
      const entry = `[Storniert ${viewDate(today)}, neuer Antrag] keine Entschädigung mehr geschuldet`;
      tx.update(db.collection(BOOKING_COLLECTION).doc(okey), { status: 'cancelled', notes: old ? `${old}\n${entry}` : entry });
    }
    tx.update(financeRef, { requestedAt, requestedBy });
    if (taskKey && treasurer) {
      tx.set(db.collection(TASK_COLLECTION).doc(taskKey), {
        tenants: [tenantId], isArchived: false,
        name: `Trainerentschädigung prüfen: ${courseName}`.slice(0, 200), index: '', tags: '',
        notes: compensationTaskNotes({ courseName, requestedBy, lines, plan, unlisted, courseUrl }),
        author: requestedBy,
        assignee: { key: treasurer.key, name1: treasurer.name1, name2: treasurer.name2, modelType: 'person', type: '', subType: '', label: `${treasurer.name1} ${treasurer.name2}`.trim() },
        state: 'initial',          // a re-request reopens the task
        dueDate: '', completionDate: '',
        priority: 'medium', importance: 'medium',
        calendars: [], rank: '', shareKey: '', parentKey: '',
        relatedModelType: '', relatedKey: '',
        linkModelType: 'course', linkKey: `course.${courseKey}`,
        links: [],
      });
    }
    return plan;
  });

  if (!taskKey) logger.warn(`${CF_NAME}: no treasurer for tenant ${tenantId} — review task not created (course ${courseKey})`);
  logger.info(`${CF_NAME}: course ${courseKey} books ${accountingTenantId}: written=${result.write.length} kept=${result.keep.length} skipped=${result.skipped.length} retired=${result.retire.length} strayPosted=${result.strayPosted.length}`);
  return {
    written: result.write.length,
    kept: [
      ...result.keep.map(k => ({ personKey: k.line.person.key, posted: k.posted, computed: k.line.amount })),
      ...result.strayPosted.map(s => ({ personKey: s.personKey ?? '', posted: s.amount, computed: 0 })),
    ],
    taskKey,
    unlistedKeys: unlisted.map(p => p.key),
  };
}

/**
 * Callable: `{ courseKey, accountingTenantId }` → `{ written, kept, taskKey, unlistedKeys }` (spec 1.132 §7.6).
 * Options as `reviewBooking` (region, App Check enforced, cors).
 */
export const requestCourseCompensation = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<RequestCourseCompensationData>): Promise<RequestCourseCompensationResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return requestCompensation(getFirestore(), request.auth!.uid, request.data, new Date());
  },
);
