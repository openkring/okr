// apps/functions/src/course/request-compensation.ts
//
// Callable `requestCourseCompensation` (spec 1.132 §7.6): a responsible person of a locked course asks for the
// trainers' compensation. Mirrors the OCR expense flow (accounting skill, ocr-and-expenses.md).
//
// Native books: one `forReview` booking per owed trainer (debit the compensation expense account, credit
// `employeePayablesAccountKey`, `bookingNo` 0) and one review task for the treasurer. The treasurer's approval in
// the journal (`reviewBooking`) IS the release (D13); the payment happens outside Kring (D6).
//
// Books that are not native (bexio, D14 / §7.6 step 5): NO bookings — Kring never writes ledger data into books it
// does not keep. The treasurer still gets the task with the settlement (count × rate = amount per trainer and the
// course-table link) to enter it in the external system, and the finance doc still gets the request stamp. That path
// needs no accounts and no Kostenstelle.
//
// Re-request semantics (§7.6 step 6, `planCompensationBookings`):
// - `posted` is never touched; the response reports posted vs computed (Kring does not correct it);
// - `cancelled` is FINAL: the treasurer rejected it with a reason in `reviewBooking`. It is never touched either and
//   is reported in the response;
// - only `draft`/`forReview` are overwritten;
// - amount 0 writes nothing; an open (`draft`/`forReview`) booking left from an earlier request is DELETED with its
//   lines (it never reached the ledger): approving it would pay trainings the new count no longer contains, and
//   setting it `cancelled` would pass it off as a treasurer's rejection and block the trainer on every later
//   request. The same applies to the open booking of a person who left `eligible`.
//
// Every read that decides the outcome (course lock/rights/archive, finance doc, books, events, existing bookings)
// happens inside the transaction, so a concurrent unlock, edit or `reviewBooking` approval retries the request.
//
// Narrowed against §7.6 (plan decision): no voucher file in v1 — the treasurer reads the course table through the
// task link.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldPath, getFirestore, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { convertDateFormatToString, DateFormat, isProfitAndLossAccountId, publicAppOrigin } from '@okr/shared-util-core';
import { CourseFinanceDocId, CourseFinanceSubcollection, MoneyModel, type AvatarInfo, type BookingStatus, type CalEventModel, type CourseEligible, type CourseFinanceModel } from '@okr/shared-models';
import { computeCompensation, unlistedLeaders, type CompensationLine } from '@okr/calendar-course-util';

import { assertExplicitCostCenter, costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
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

/** A person key that is safe inside `course-<courseKey>-<personKey>`: no `-` (ambiguous okey), no `/` (path). */
const PLAIN_KEY = /^[A-Za-z0-9_]+$/;

// ---------------------------------------------------------------------------------------------------------------
// Pure part
// ---------------------------------------------------------------------------------------------------------------

/** A compensation booking already in the ledger: its status, its debit total (minor units) and its trainer. */
export type ExistingBooking = { okey: string; status: BookingStatus; amount: number; personKey?: string };

export type CompensationPlan = {
  /** lines that get a fresh `forReview` booking (new, or replacing a draft/forReview one) */
  write: CompensationLine[];
  /** lines whose booking is already posted: left alone, the posted amount is reported against the computed one */
  keep: { line: CompensationLine; posted: number }[];
  /** lines whose booking the treasurer rejected (`cancelled`): final, left alone, reported */
  cancelled: { line: CompensationLine; amount: number }[];
  /** lines with amount 0 and no posted/cancelled booking: nothing is written */
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

/** The deterministic okey of the treasurer's review task (one per course). */
export function compensationTaskKey(courseKey: string): string {
  return `course-${courseKey}-compensation`;
}

const isOpen = (status: BookingStatus): boolean => status === 'draft' || status === 'forReview';

/**
 * What a (re-)request writes, keeps, skips and retires. `existing` holds the course's compensation bookings by okey
 * (also those of persons no longer in `lines`). `posted` and `cancelled` always win: they are never touched.
 */
export function planCompensationBookings(lines: CompensationLine[], existing: Record<string, ExistingBooking>, courseKey: string): CompensationPlan {
  const plan: CompensationPlan = { write: [], keep: [], cancelled: [], skipped: [], retire: [], strayPosted: [] };
  const lineKeys = new Set<string>();
  for (const line of lines) {
    const okey = compensationBookingKey(courseKey, line.person.key);
    lineKeys.add(okey);
    const booking = existing[okey];
    if (booking?.status === 'posted') {
      plan.keep.push({ line, posted: booking.amount });
    } else if (booking?.status === 'cancelled') {
      plan.cancelled.push({ line, amount: booking.amount });
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

/** Person keys that appear more than once in `eligible`. */
export function duplicateEligibleKeys(eligible: Pick<CourseEligible, 'person'>[]): string[] {
  const seen = new Set<string>();
  const result = new Set<string>();
  for (const { person } of eligible) {
    const key = person?.key ?? '';
    if (seen.has(key)) result.add(key);
    seen.add(key);
  }
  return [...result];
}

/** Person keys of `eligible` that are not plain doc ids (empty, or containing `-`, `/` or other characters). */
export function invalidEligibleKeys(eligible: Pick<CourseEligible, 'person'>[]): string[] {
  return eligible.map(e => e.person?.key ?? '').filter(k => !PLAIN_KEY.test(k));
}

/**
 * The finance doc as read off Firestore, with every field a legacy or partial doc lacks filled in. A missing
 * `defaultRate` becomes 0 in the books' currency.
 */
export function coalesceFinance(raw: Partial<CourseFinanceModel> | undefined, currency = 'CHF'): CourseFinanceModel {
  return {
    accountingTenantId: raw?.accountingTenantId ?? '',
    accountKey: raw?.accountKey ?? '',
    costCenterKey: raw?.costCenterKey ?? '',
    defaultRate: raw?.defaultRate ?? new MoneyModel(0, currency as MoneyModel['currency']),
    eligible: raw?.eligible ?? [],
    requestedAt: raw?.requestedAt ?? '',
    requestedBy: raw?.requestedBy,
  };
}

function isValidRate(rate: Partial<MoneyModel> | undefined, currency: string): boolean {
  const amount = rate?.amount;
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && rate?.currency === currency;
}

/**
 * The rates that cannot be booked: an amount that is not a non-negative integer (minor units), or a currency other
 * than the books' functional currency. Returns `'defaultRate'` and/or the person keys with a bad own rate.
 */
export function invalidRates(finance: Pick<CourseFinanceModel, 'defaultRate' | 'eligible'>, currency: string): string[] {
  const bad: string[] = [];
  if (!isValidRate(finance.defaultRate, currency)) bad.push('defaultRate');
  for (const e of finance.eligible) {
    if (e.rate !== undefined && !isValidRate(e.rate, currency)) bad.push(e.person?.key ?? '');
  }
  return bad;
}

/**
 * Why an existing booking at `course-<c>-<p>` must not be overwritten or removed by this request, or '' when it may:
 * it must belong to the caller's tenant, to the requested books and to that very person.
 */
export function foreignBookingReason(booking: Record<string, unknown>, expected: { tenantId: string; accountingTenantId: string; personKey: string }): string {
  if (!((booking['tenants'] as string[] | undefined) ?? []).includes(expected.tenantId)) return 'other-tenant';
  if (booking['accountingTenantId'] !== expected.accountingTenantId) return 'other-books';
  if ((booking['counterparty'] as AvatarInfo | undefined)?.key !== expected.personKey) return 'other-person';
  return '';
}

/** 'CHF 50.00' — minor units to a display amount (same rendering as the OCR task params). */
function formatMoney(amount: number, currency: string): string {
  return `${currency} ${(amount / 100).toFixed(2)}`;
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

function settlementRow(l: CompensationLine): string {
  return `- ${personLabel(l.person)}: ${l.ledCount} × ${formatMoney(l.rate.amount, l.rate.currency)} = ${formatMoney(l.amount, l.rate.currency)}`;
}

/**
 * The review task's notes — the settlement only (who asked is the task's author), so that an unchanged
 * re-request yields the same text and leaves the task alone. Native books: drafts in the journal, posted and
 * rejected bookings left alone. Other books (`plan` undefined): the whole settlement, to enter there.
 */
export function compensationTaskNotes(input: {
  courseName: string; lines: CompensationLine[]; plan: CompensationPlan | undefined;
  unlisted: AvatarInfo[]; courseUrl: string; currency: string;
}): string {
  const { plan, currency } = input;
  const out = [`Trainerentschädigung für den Kurs «${input.courseName}».`, ''];
  if (!plan) {
    const owed = input.lines.filter(l => l.amount > 0);
    out.push('Diese Bücher werden ausserhalb von Kring geführt. Kring hat keine Buchungen erstellt; bitte erfasse die Abrechnung dort:');
    if (owed.length === 0) out.push('- keine');
    owed.forEach(l => out.push(settlementRow(l)));
  } else {
    out.push('Entwürfe zur Prüfung im Journal:');
    if (plan.write.length === 0) out.push('- keine');
    plan.write.forEach(l => out.push(settlementRow(l)));
    if (plan.keep.length + plan.strayPosted.length > 0) {
      out.push('', 'Bereits gebucht (Kring ändert diese Buchungen nicht):');
      for (const k of plan.keep) {
        out.push(`- ${personLabel(k.line.person)}: gebucht ${formatMoney(k.posted, currency)}, neu berechnet ${formatMoney(k.line.amount, currency)}`);
      }
      for (const s of plan.strayPosted) {
        out.push(`- ${s.personKey || s.okey}: gebucht ${formatMoney(s.amount, currency)}, nicht mehr berechtigt`);
      }
    }
    if (plan.cancelled.length > 0) {
      out.push('', 'Abgelehnt (Kring ändert diese Buchungen nicht):');
      for (const c of plan.cancelled) {
        out.push(`- ${personLabel(c.line.person)}: abgelehnt ${formatMoney(c.amount, currency)}, neu berechnet ${formatMoney(c.line.amount, currency)}`);
      }
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
  /** false = the books are kept outside Kring: no bookings, the task carries the settlement */
  nativeBooks: boolean;
  written: number;
  kept: { personKey: string; posted: number; computed: number }[];
  /** bookings the treasurer rejected: final, never rewritten */
  cancelled: { personKey: string; amount: number; computed: number }[];
  taskKey: string;
  /** persons who led a counted training but are not in `eligible` (§7.6 marker) */
  unlistedKeys: string[];
}

type FailCode = 'failed-precondition' | 'invalid-argument' | 'permission-denied' | 'not-found';

function fail(code: FailCode, message: string, reason: string, extra: Record<string, unknown> = {}): never {
  throw new HttpsError(code, message, { reason, ...extra });
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

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Course, group, finance and books: read in the transaction, checked in this order. */
async function readAndCheckCourse(db: Firestore, tx: Transaction, ids: { courseKey: string; accountingTenantId: string; tenantId: string; personKey: string; roles: Record<string, unknown> }) {
  const { courseKey, accountingTenantId, tenantId, personKey, roles } = ids;
  const courseRef = db.collection(COURSE_COLLECTION).doc(courseKey);
  const course = (await tx.get(courseRef)).data();
  if (!course) fail('not-found', `course ${courseKey} not found`, 'course-not-found');
  if (!asStrings(course['tenants']).includes(tenantId)) fail('permission-denied', 'course belongs to another tenant', 'course-other-tenant');
  if (course['isArchived'] === true) fail('failed-precondition', 'the course is archived', 'course-archived');

  // Authorisation, independent of firestore.rules: privileged/admin, a stored responsible, or an admin of the
  // course's group in the caller's tenant (persons are shared across tenants).
  const isPrivileged = roles['privileged'] === true || roles['admin'] === true;
  const isResponsible = personKey !== '' && asStrings(course['responsibleKeys']).includes(personKey);
  let isGroupAdmin = false;
  const groupKey = (course['groupKey'] as string | undefined) ?? '';
  if (!isPrivileged && !isResponsible && personKey !== '' && isDocKey(groupKey)) {
    const group = (await tx.get(db.collection(GROUP_COLLECTION).doc(groupKey))).data();
    isGroupAdmin = !!group && asStrings(group['tenants']).includes(tenantId) && asStrings(group['adminKeys']).includes(personKey);
  }
  if (!isPrivileged && !isResponsible && !isGroupAdmin) {
    fail('permission-denied', 'only a responsible person, a group admin or a privileged user may request the compensation', 'not-course-manager');
  }
  // Frozen course: the numbers are stable, and freezing requires every past event to be confirmed (§7.8).
  if (course['isLocked'] !== true) fail('failed-precondition', 'the course must be locked first', 'course-not-locked');

  const financeRef = courseRef.collection(CourseFinanceSubcollection).doc(CourseFinanceDocId);
  const financeSnap = await tx.get(financeRef);
  if (!financeSnap.exists) fail('failed-precondition', 'the course has no compensation settings', 'no-finance');
  const rawFinance = financeSnap.data() as Partial<CourseFinanceModel>;
  if ((rawFinance.accountingTenantId ?? '') !== accountingTenantId) {
    fail('invalid-argument', `the course is settled in the books ${rawFinance.accountingTenantId || '(none)'}, not ${accountingTenantId}`, 'books-mismatch');
  }
  const config = (await tx.get(db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId))).data();
  if (!config) fail('failed-precondition', `no accounting settings for the books ${accountingTenantId}`, 'no-accounting-config');
  if (!asStrings(config['tenants']).includes(tenantId)) fail('permission-denied', 'the books belong to another tenant', 'books-other-tenant');

  const currency = (config['functionalCurrency'] as string | undefined) || 'CHF';   // legacy configs lack it
  const finance = coalesceFinance(rawFinance, currency);
  const badKeys = invalidEligibleKeys(finance.eligible);
  if (badKeys.length > 0) fail('invalid-argument', `not a valid person key in eligible: ${badKeys.join(', ')}`, 'invalid-person-key', { keys: badKeys });
  const duplicates = duplicateEligibleKeys(finance.eligible);
  if (duplicates.length > 0) fail('invalid-argument', `a person is listed more than once: ${duplicates.join(', ')}`, 'duplicate-eligible', { keys: duplicates });
  const badRates = invalidRates(finance, currency);
  if (badRates.length > 0) {
    fail('invalid-argument', `rates must be whole ${currency} minor units ≥ 0: ${badRates.join(', ')}`, 'invalid-rate', { rates: badRates });
  }
  return { course, financeRef, finance, config, currency };
}

/** The booking accounts and the Kostenstelle of native books, validated against these books' chart. */
async function resolveAccounts(db: Firestore, tenantId: string, accountingTenantId: string, finance: CourseFinanceModel, config: Record<string, unknown>) {
  const debitAccountKey = finance.accountKey || ((config['defaultCompensationAccountKey'] as string | undefined) ?? '');
  const creditAccountKey = (config['employeePayablesAccountKey'] as string | undefined) ?? '';
  if (!debitAccountKey) fail('failed-precondition', 'no compensation account: set one on the course or a default in the accounting settings', 'missing-account', { account: 'debit' });
  if (!creditAccountKey) fail('failed-precondition', 'no employee payables account in the accounting settings', 'missing-account', { account: 'credit' });
  // loadCostCenterContext keeps only accounts of the caller's tenant AND of these books
  const ctx = await loadCostCenterContext(db, tenantId, accountingTenantId, [debitAccountKey, creditAccountKey]);
  if (!ctx.accounts.has(debitAccountKey)) fail('failed-precondition', `the compensation account ${debitAccountKey} is not in the books ${accountingTenantId}`, 'invalid-account', { account: 'debit' });
  if (!ctx.accounts.has(creditAccountKey)) fail('failed-precondition', `the payables account ${creditAccountKey} is not in the books ${accountingTenantId}`, 'invalid-account', { account: 'credit' });
  if (!isProfitAndLossAccountId(ctx.accounts.get(debitAccountKey)?.id)) {
    fail('failed-precondition', `the compensation account ${debitAccountKey} is not an expense (P&L) account`, 'invalid-account', { account: 'debit' });
  }
  // As writeBooking: an explicit Kostenstelle must be an active leaf of these books (invalid-argument, reason
  // cost-center-invalid); an empty one falls back to the account default, then the book default.
  assertExplicitCostCenter(ctx, debitAccountKey, finance.costCenterKey, new Set());
  const debitCostCenterKey = costCenterKeyForLine(ctx, debitAccountKey, { explicit: finance.costCenterKey });
  return { debitAccountKey, creditAccountKey, debitCostCenterKey };
}

/**
 * The work of the callable, with Firestore and the clock injected (testable without the emulator).
 */
export async function requestCompensation(db: Firestore, uid: string, data: RequestCourseCompensationData, now: Date): Promise<RequestCourseCompensationResult> {
  const courseKey = data?.courseKey;
  const accountingTenantId = data?.accountingTenantId;
  if (!isDocKey(courseKey)) fail('invalid-argument', 'courseKey is required', 'invalid-course-key');
  // The books come ONLY from the request — never defaulted from the app tenant (accounting skill).
  if (!isDocKey(accountingTenantId)) fail('invalid-argument', 'accountingTenantId is required', 'missing-books');

  // ---- caller + task inputs that no concurrent course edit can change (queries: outside the transaction) ----
  const user = (await db.collection(USERS_COLLECTION).doc(uid).get()).data() ?? {};
  const tenantId = asStrings(user['tenants'])[0] ?? '';
  if (!tenantId) fail('failed-precondition', 'User is not linked to a tenant.', 'no-tenant');
  const personKey = (user['personKey'] as string | undefined) ?? '';
  const roles = (user['roles'] as Record<string, unknown> | undefined) ?? {};
  const requestedBy = avatarOfUser(personKey, user);
  const appConfig = (await db.collection(APP_CONFIG_COLLECTION).doc(tenantId).get()).data();
  const courseUrl = `${publicAppOrigin(appConfig?.['appDomain'] as string | undefined, tenantId)}/course/table/${courseKey}`;
  const { date: today, time } = zurichDateTimeParts(now);
  const requestedAt = `${today}${time.replace(':', '')}00`;   // StoreDateTime yyyyMMddHHmmss, Zurich wall clock
  const prefix = compensationBookingKey(courseKey, '');

  const result = await db.runTransaction(async (tx) => {
    // ================= reads (all before the first write) =================
    const { course, financeRef, finance, config, currency } = await readAndCheckCourse(db, tx, { courseKey, accountingTenantId, tenantId, personKey, roles });
    const nativeBooks = (config['accountingBackend'] ?? 'native') === 'native';

    // Server-side count (§7.6 step 2). Single-field equality (auto-indexed); the tenant filter runs here,
    // courseEvents() drops archived and cancelled events.
    const eventSnap = await tx.get(db.collection(CALEVENT_COLLECTION).where('courseKey', '==', courseKey));
    const events = eventSnap.docs
      .map(d => ({ ...(d.data() as CalEventModel), okey: d.id }))
      .filter(e => (e.tenants ?? []).includes(tenantId));
    const lines = computeCompensation(events, finance);
    const unlisted = unlistedLeaders(events, finance);

    let plan: CompensationPlan | undefined;
    let accounts: Awaited<ReturnType<typeof resolveAccounts>> | undefined;
    const bookingDocs = new Map<string, Record<string, unknown>>();
    const existingLineRefs = new Map<string, DocumentReference[]>();
    if (nativeBooks) {
      // Exact refs of the current lines, plus every booking of this course (okey prefix) for persons who left
      // `eligible`. A prefix hit only counts when its okey is exactly course-<key>-<counterparty.key>: course
      // `c1-x` shares the prefix of course `c1`.
      const lineRefs = lines.map(l => db.collection(BOOKING_COLLECTION).doc(compensationBookingKey(courseKey, l.person.key)));
      const exactSnaps = lineRefs.length ? await tx.getAll(...lineRefs) : [];
      const rangeSnap = await tx.get(db.collection(BOOKING_COLLECTION)
        .where(FieldPath.documentId(), '>=', prefix)
        .where(FieldPath.documentId(), '<', `${prefix}`));
      for (const s of exactSnaps) if (s.exists) bookingDocs.set(s.id, s.data() ?? {});
      for (const s of rangeSnap.docs) {
        const counterpartyKey = (s.data()['counterparty'] as AvatarInfo | undefined)?.key ?? '';
        if (!bookingDocs.has(s.id) && counterpartyKey && s.id === compensationBookingKey(courseKey, counterpartyKey)) bookingDocs.set(s.id, s.data());
      }
      const existing: Record<string, ExistingBooking> = {};
      for (const [okey, b] of bookingDocs) {
        const lineSnap = await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', okey));
        existingLineRefs.set(okey, lineSnap.docs.map(d => d.ref));
        existing[okey] = {
          okey, status: (b['status'] as BookingStatus | undefined) ?? 'draft',
          amount: debitTotal(lineSnap.docs.map(d => d.data())),
          personKey: (b['counterparty'] as AvatarInfo | undefined)?.key,
        };
      }
      plan = planCompensationBookings(lines, existing, courseKey);

      // Overwrite guard: a booking this request rewrites or removes must be ours — this tenant, these books, that
      // person. Anything else at a course-<c>-<p> okey is left for a human.
      // the expected person of an okey: the line's person, else (a stray) the counterparty the range filter matched
      const linePerson = new Map(lines.map(l => [compensationBookingKey(courseKey, l.person.key), l.person.key]));
      const touched = [
        ...plan.write.map(l => ({ okey: compensationBookingKey(courseKey, l.person.key), personKey: l.person.key })),
        ...plan.retire.map(okey => ({ okey, personKey: linePerson.get(okey) ?? existing[okey]?.personKey ?? '' })),
      ];
      for (const t of touched) {
        const doc = bookingDocs.get(t.okey);
        const reason = doc ? foreignBookingReason(doc, { tenantId, accountingTenantId, personKey: t.personKey }) : '';
        if (reason) fail('failed-precondition', `booking ${t.okey} exists but does not belong to this request (${reason})`, 'foreign-booking', { bookingKey: t.okey, mismatch: reason });
      }
      if (plan.write.length > 0) accounts = await resolveAccounts(db, tenantId, accountingTenantId, finance, config);
    }

    const courseName = (course['name'] as string | undefined) ?? '';
    const startDate = (course['startDate'] as string | undefined) ?? '';
    const endDate = (course['endDate'] as string | undefined) ?? '';
    const treasurer = await resolveTreasurer(tenantId, (config['reviewAssigneePersonKey'] as string | undefined) ?? '');
    const taskRef = db.collection(TASK_COLLECTION).doc(compensationTaskKey(courseKey));
    const notes = compensationTaskNotes({ courseName, lines, plan, unlisted, courseUrl, currency });
    const oldTask = treasurer?.key ? (await tx.get(taskRef)).data() : undefined;

    // ================= writes =================
    for (const line of plan?.write ?? []) {
      if (!accounts) break;   // unreachable: accounts are resolved whenever something is written
      const okey = compensationBookingKey(courseKey, line.person.key);
      const debitRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${okey}-d`);
      const creditRef = db.collection(BOOKING_LINE_COLLECTION).doc(`${okey}-c`);
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
      tx.set(debitRef, {
        tenants: [tenantId], isArchived: false,
        bookingKey: okey, accountKey: accounts.debitAccountKey,
        ...(accounts.debitCostCenterKey ? { costCenterKey: accounts.debitCostCenterKey } : {}),
        debitAmount: { amount: line.amount, currency, periodicity: 'one-time' },
        accountingTenantId,
      });
      tx.set(creditRef, {
        tenants: [tenantId], isArchived: false,
        bookingKey: okey, accountKey: accounts.creditAccountKey,
        creditAmount: { amount: line.amount, currency, periodicity: 'one-time' },
        accountingTenantId,
      });
    }
    for (const okey of plan?.retire ?? []) {
      // never in the ledger (draft/forReview): removed with its lines, see the header
      for (const ref of existingLineRefs.get(okey) ?? []) tx.delete(ref);
      tx.delete(db.collection(BOOKING_COLLECTION).doc(okey));
    }
    tx.update(financeRef, { requestedAt, requestedBy });

    let taskKey = '';
    if (treasurer?.key) {
      taskKey = taskRef.id;
      // Only a changed settlement (re)opens the task; an unchanged re-request keeps its state (e.g. done).
      if (!oldTask || oldTask['notes'] !== notes || oldTask['isArchived'] === true) {
        tx.set(taskRef, {
          tenants: [tenantId], isArchived: false,
          name: `Trainerentschädigung prüfen: ${courseName}`.slice(0, 200), index: '', tags: '',
          notes,
          author: requestedBy,
          assignee: { key: treasurer.key, name1: treasurer.name1, name2: treasurer.name2, modelType: 'person', type: '', subType: '', label: `${treasurer.name1} ${treasurer.name2}`.trim() },
          state: 'initial',
          dueDate: '', completionDate: '',
          priority: 'medium', importance: 'medium',
          calendars: [], rank: '', shareKey: '', parentKey: '',
          relatedModelType: '', relatedKey: '',
          linkModelType: 'course', linkKey: `course.${courseKey}`,
          links: [],
        });
      }
    }
    return { nativeBooks, plan, lines, unlisted, taskKey };
  });

  const { plan } = result;
  if (!result.taskKey) logger.warn(`${CF_NAME}: no treasurer for tenant ${tenantId} — review task not created (course ${courseKey})`);
  logger.info(`${CF_NAME}: course ${courseKey} books ${accountingTenantId} native=${result.nativeBooks}: written=${plan?.write.length ?? 0} kept=${plan?.keep.length ?? 0} cancelled=${plan?.cancelled.length ?? 0} skipped=${plan?.skipped.length ?? 0} retired=${plan?.retire.length ?? 0} strayPosted=${plan?.strayPosted.length ?? 0}`);
  return {
    nativeBooks: result.nativeBooks,
    written: plan?.write.length ?? 0,
    kept: [
      ...(plan?.keep ?? []).map(k => ({ personKey: k.line.person.key, posted: k.posted, computed: k.line.amount })),
      ...(plan?.strayPosted ?? []).map(s => ({ personKey: s.personKey ?? '', posted: s.amount, computed: 0 })),
    ],
    cancelled: (plan?.cancelled ?? []).map(c => ({ personKey: c.line.person.key, amount: c.amount, computed: c.line.amount })),
    taskKey: result.taskKey,
    unlistedKeys: result.unlisted.map(p => p.key),
  };
}

/**
 * Callable: `{ courseKey, accountingTenantId }` → `RequestCourseCompensationResult` (spec 1.132 §7.6).
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
