import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, formatRejectNote, isBalanced, nextBookingNo } from '@okr/shared-util-functions';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';

const REGION = 'europe-west6';
const CF_NAME = 'reviewBooking';
const WRITE_CF_NAME = 'writeBooking';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const OCR_RESULT_COLLECTION = 'ocr-results';
const EXPENSE_COLLECTION = 'expenses';
const TASK_COLLECTION = 'tasks';
const USERS_COLLECTION = 'users';

const MAX_REASON_LENGTH = 500;

interface ReviewLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: string } | null;
  creditAmount?: { amount: number; currency: string } | null;
}

interface ReviewBookingData {
  bookingKey: string;
  decision: 'approve' | 'reject';
  reason?: string;               // required for 'reject'
  corrections?: {                // 'approve' only; every field optional
    title?: string;
    date?: string;               // StoreDate yyyymmdd
    counterparty?: Record<string, unknown> | null;
    lines?: ReviewLine[];
  };
}

/**
 * Treasurer decision on a `forReview` booking created by the OCR pipeline (spec 1.20,
 * design 2026-08-01-booking-review-ui-design.md).
 *
 * `bookings` / `booking-lines` are CF-write-only (firestore.rules), so this callable is the only
 * way the treasurer's approve/reject reaches the ledger. Approving assigns the per-year `bookingNo`
 * **inside the transaction** — the client-side `BookingService.nextSequence` computes the same
 * number from a cached list and would race a concurrent approval.
 *
 * Idempotent: a booking that is already `posted`/`cancelled` returns its current state instead of
 * failing, so a retried call after a dropped response cannot double-number a booking.
 */
export const reviewBooking = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<ReviewBookingData>): Promise<{ bookingNo: number; status: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    // treasurer OR admin — matches isTreasurerGuard and the ocr-rules rule in firestore.rules.
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    // Never trust a client-supplied tenantId (see 1.18 / the _gateway hardening).
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const d = request.data;
    const bookingKey = d?.bookingKey;
    const decision = d?.decision;
    if (!bookingKey || (decision !== 'approve' && decision !== 'reject')) {
      throw new HttpsError('invalid-argument', 'bookingKey and decision (approve|reject) are required');
    }
    const reason = (d.reason ?? '').trim().slice(0, MAX_REASON_LENGTH);
    if (decision === 'reject' && reason.length === 0) {
      throw new HttpsError('invalid-argument', 'a reason is required to reject a booking');
    }

    const db = getFirestore();
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- reads that need no transactional consistency (queries cannot follow a tx write) ----
    const preSnap = await bookingRef.get();
    if (!preSnap.exists) throw new HttpsError('not-found', `booking ${bookingKey} not found`);
    const pre = preSnap.data() ?? {};
    if (!((pre['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'booking belongs to another tenant');
    }

    const corrections = decision === 'approve' ? d.corrections : undefined;
    const newLines = corrections?.lines;
    if (newLines && !isBalanced(newLines)) {
      throw new HttpsError('invalid-argument', 'the corrected booking lines are not balanced');
    }

    // The review task: `expense` usage hangs it on the expense, every usage latches it on the
    // ocr-result (OcrResultModel.taskKey). Both may be absent for a hand-made booking.
    const taskKey = await resolveTaskKey(db, bookingKey);
    const expenseRef = db.collection(EXPENSE_COLLECTION).doc(bookingKey);
    const expenseExists = (await expenseRef.get()).exists;
    const oldLineRefs = newLines
      ? (await db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', bookingKey).get()).docs.map(s => s.ref)
      : [];
    const reviewer = decision === 'reject' ? await reviewerName(db, request.auth!.uid) : '';

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      const booking = snap.data();
      if (!booking) throw new HttpsError('not-found', `booking ${bookingKey} not found`);

      const status = booking['status'] as string;
      // Already decided — return the current state rather than re-numbering (retry safety).
      if (status === 'posted' || status === 'cancelled') {
        return { bookingNo: (booking['bookingNo'] as number) ?? 0, status };
      }
      if (status !== 'forReview') {
        throw new HttpsError('failed-precondition', `booking ${bookingKey} is ${status}, not forReview`);
      }

      if (decision === 'reject') {
        const today = convertDateFormatToString(getTodayStr(), DateFormat.StoreDate, DateFormat.ViewDate, false);
        tx.set(bookingRef, {
          status: 'cancelled',
          notes: formatRejectNote((booking['notes'] as string) ?? '', today, reviewer, reason),
        }, { merge: true });
        if (taskKey) tx.set(db.collection(TASK_COLLECTION).doc(taskKey), { state: 'cancelled' }, { merge: true });
        if (expenseExists) tx.set(expenseRef, { status: 'error' }, { merge: true });
        return { bookingNo: 0, status: 'cancelled' };
      }

      // ---- approve ----
      const date = corrections?.date || (booking['date'] as string) || '';
      const year = Number(date.substring(0, 4));
      if (!Number.isInteger(year) || year < 1900) {
        throw new HttpsError('failed-precondition', 'the booking has no valid date — correct it before approving');
      }
      const accountingTenantId = booking['accountingTenantId'] as string;
      const ledger = await tx.get(
        db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId),
      );
      const bookingNo = nextBookingNo(ledger.docs.map(s => s.data() as { date?: string; bookingNo?: number }), year);

      const header: Record<string, unknown> = { status: 'posted', bookingNo };
      if (corrections?.title !== undefined) header['title'] = corrections.title.slice(0, 200);
      if (corrections?.date !== undefined) header['date'] = corrections.date;
      if (corrections?.counterparty !== undefined) header['counterparty'] = corrections.counterparty;
      tx.set(bookingRef, header, { merge: true });

      if (newLines) {
        for (const ref of oldLineRefs) tx.delete(ref);
        for (const line of newLines) {
          tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(), {
            tenants: [tenantId], isArchived: false,
            bookingKey, accountKey: line.accountKey,
            ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
            ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
            accountingTenantId,
          });
        }
      }

      if (taskKey) {
        tx.set(db.collection(TASK_COLLECTION).doc(taskKey), {
          state: 'done', completionDate: getTodayStr(),
        }, { merge: true });
      }
      if (expenseExists) tx.set(expenseRef, { status: 'posted', bookingKey }, { merge: true });

      return { bookingNo, status: 'posted' };
    });

    logger.info(`${CF_NAME}: booking ${bookingKey} → ${result.status} (no=${result.bookingNo}, tenant=${tenantId})`);
    return result;
  },
);

/** One line of a manual journal entry (amounts in minor units). */
interface WriteLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: string } | null;
  creditAmount?: { amount: number; currency: string } | null;
  amountFx?: { amount: number; currency: string } | null;
  exchangeRateKey?: string;
  vatCodeKey?: string;
}

interface WriteBookingData {
  mode: 'create' | 'update' | 'delete';
  bookingKey?: string;                 // required for update/delete
  accountingTenantId?: string;         // required for create
  booking?: Record<string, unknown>;   // header fields, allowlisted below
  lines?: WriteLine[];                 // required for create/update
}

/** Header fields the client may set. Everything else (tenants, status, bookingNo, …) is server-owned. */
const WRITABLE_HEADER_FIELDS = ['title', 'date', 'notes', 'periodKey', 'documentKey', 'counterparty', 'tags', 'index'];

/**
 * Manual journal entry: create / update / delete a booking with its lines (spec 1.20 §8).
 *
 * Counterpart of {@link reviewBooking} for the journal's own actions — `bookings` /
 * `booking-lines` are CF-write-only, so the client cannot batch-write them itself.
 * `bookingNo` is assigned inside the transaction on create (same rule as approval), status and
 * `tenants` are server-owned, and `forReview` bookings are refused here: those belong to
 * `reviewBooking`, which also closes the OCR task and the expense.
 */
export const writeBooking = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<WriteBookingData>): Promise<{ bookingKey: string; bookingNo: number }> => {
    checkAppCheckToken(request as never, WRITE_CF_NAME);
    checkAuthentication(request as never, WRITE_CF_NAME);
    await checkRoles(request as never, WRITE_CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, WRITE_CF_NAME);

    const d = request.data;
    const mode = d?.mode;
    if (mode !== 'create' && mode !== 'update' && mode !== 'delete') {
      throw new HttpsError('invalid-argument', 'mode must be create, update or delete');
    }
    const db = getFirestore();

    // ---- the booking being changed (update/delete) ----
    let existing: Record<string, unknown> | undefined;
    if (mode !== 'create') {
      if (!d.bookingKey) throw new HttpsError('invalid-argument', 'bookingKey is required');
      const snap = await db.collection(BOOKING_COLLECTION).doc(d.bookingKey).get();
      existing = snap.data();
      if (!existing) throw new HttpsError('not-found', `booking ${d.bookingKey} not found`);
      if (!((existing['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'booking belongs to another tenant');
      }
      if (existing['status'] === 'forReview') {
        throw new HttpsError('failed-precondition', 'a forReview booking is changed through reviewBooking');
      }
    }

    const bookingKey = mode === 'create' ? db.collection(BOOKING_COLLECTION).doc().id : d.bookingKey!;
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
    const oldLineRefs = (await db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', bookingKey).get())
      .docs.map(s => s.ref);

    if (mode === 'delete') {
      const batch = db.batch();
      for (const ref of oldLineRefs) batch.delete(ref);
      batch.delete(bookingRef);
      await batch.commit();
      logger.info(`${WRITE_CF_NAME}: deleted booking ${bookingKey} (tenant=${tenantId})`);
      return { bookingKey, bookingNo: 0 };
    }

    const lines = d.lines ?? [];
    if (!isBalanced(lines)) throw new HttpsError('invalid-argument', 'the booking lines are not balanced');

    const header: Record<string, unknown> = {};
    for (const field of WRITABLE_HEADER_FIELDS) {
      if (d.booking?.[field] !== undefined) header[field] = d.booking[field];
    }
    const date = (header['date'] as string) ?? (existing?.['date'] as string) ?? '';
    const year = Number(date.substring(0, 4));
    if (!Number.isInteger(year) || year < 1900) {
      throw new HttpsError('invalid-argument', 'the booking needs a valid date (yyyymmdd)');
    }
    const accountingTenantId = mode === 'create'
      ? (d.accountingTenantId ?? '')
      : (existing!['accountingTenantId'] as string);
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');

    const bookingNo = await db.runTransaction(async (tx) => {
      let no = (existing?.['bookingNo'] as number) ?? 0;
      if (mode === 'create' || no === 0) {
        const ledger = await tx.get(
          db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId),
        );
        no = nextBookingNo(ledger.docs.map(s => s.data() as { date?: string; bookingNo?: number }), year);
      }
      tx.set(bookingRef, {
        ...header,
        bookingNo: no,
        status: 'posted',
        accountingTenantId,
        tenants: [tenantId],
        isArchived: false,
      }, { merge: true });

      for (const ref of oldLineRefs) tx.delete(ref);
      for (const line of lines) {
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(), {
          tenants: [tenantId], isArchived: false,
          bookingKey, accountKey: line.accountKey, accountingTenantId,
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
          ...(line.amountFx ? { amountFx: { ...line.amountFx, periodicity: 'one-time' } } : {}),
          ...(line.exchangeRateKey ? { exchangeRateKey: line.exchangeRateKey } : {}),
          ...(line.vatCodeKey ? { vatCodeKey: line.vatCodeKey } : {}),
        });
      }
      return no;
    });

    logger.info(`${WRITE_CF_NAME}: ${mode}d booking ${bookingKey} (no=${bookingNo}, tenant=${tenantId})`);
    return { bookingKey, bookingNo };
  },
);

/**
 * The review task opened for this booking, or '' if none.
 * `expense` usage: task id == expense id == booking id (deterministic ids, OCR Round 2).
 * `invoice` usage: the task has a random id, latched onto the ocr-result as `taskKey`.
 * A booking may have several ocr-results (one per receipt); only the first carries the task.
 */
async function resolveTaskKey(db: FirebaseFirestore.Firestore, bookingKey: string): Promise<string> {
  const results = await db.collection(OCR_RESULT_COLLECTION).where('bookingKey', '==', bookingKey).get();
  for (const doc of results.docs) {
    const key = doc.data()['taskKey'] as string | undefined;
    if (key) return key;
  }
  // Fallback for results written before OcrResultModel.taskKey existed.
  return (await db.collection(TASK_COLLECTION).doc(bookingKey).get()).exists ? bookingKey : '';
}

/** Display name of the reviewing treasurer, for the rejection note. */
async function reviewerName(db: FirebaseFirestore.Firestore, uid: string): Promise<string> {
  const user = (await db.collection(USERS_COLLECTION).doc(uid).get()).data();
  const name = `${user?.['firstName'] ?? ''} ${user?.['lastName'] ?? ''}`.trim();
  return name.length > 0 ? name : uid;
}
