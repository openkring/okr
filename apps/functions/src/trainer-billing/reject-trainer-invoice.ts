/**
 * Callable `rejectTrainerInvoice({ invoiceKey, reason })` (spec 1.167 §7.5): the treasurer sends a trainer invoice
 * back. One transaction deletes the draft bill (the send created it under `ti-<invoiceKey>`; a bill left behind
 * would block the month forever), sets the invoice `rejected` with reason/by/at and frees the entries
 * (`open`, `invoiceKey ''`). The PDF, its finance-document and the invoice number stay: they are the voucher of
 * what was sent. Afterwards the trainer gets a task with the reason.
 */
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import {
  AvatarInfo, BillCollection, TrainerAgreementCollection, TrainerInvoiceCollection, TrainerInvoiceState, WorkEntryCollection,
} from '@okr/shared-models';
import { monthTitleDe } from '@okr/finance-trainer-billing-util';
import { zurichStoreDate } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { loadBooksInvoice } from './treasurer-caller';

const REGION = 'europe-west6';
const CF_NAME = 'rejectTrainerInvoice';
const TASK_COLLECTION = 'tasks';
export const MAX_REASON_LENGTH = 500;

export type RejectRefusal = '' | 'not-sent' | 'bill-booked';

/** Pure: may this invoice be rejected? Only a `sent` one, and its bill (if still there) must be an untouched draft. */
export function rejectRefusal(
  invoice: { state: TrainerInvoiceState; billKey: string },
  bill?: { state: string; bookingKeys?: string[]; payments?: unknown[] },
): RejectRefusal {
  if (invoice.state !== 'sent') return 'not-sent';
  if (invoice.billKey && bill) {
    if (bill.state !== 'draft' || (bill.bookingKeys?.length ?? 0) > 0 || (bill.payments?.length ?? 0) > 0) return 'bill-booked';
  }
  return '';
}

const ZURICH_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** StoreDateTime (`yyyyMMddHHmmss`) of `now` on the Europe/Zurich wall clock. */
function zurichStoreDateTime(now: Date): string {
  return zurichStoreDate(now) + ZURICH_CLOCK.format(now).replace(/:/g, '');
}

export async function rejectInvoice(db: Firestore, uid: string, data: { invoiceKey?: unknown; reason?: unknown }, now = new Date()): Promise<void> {
  const reason = typeof data?.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < 1 || reason.length > MAX_REASON_LENGTH) {
    throw new HttpsError('invalid-argument', `reason must be 1–${MAX_REASON_LENGTH} characters`, { reason: 'invalid-reason' });
  }
  const { caller, invoiceKey } = await loadBooksInvoice(db, uid, data?.invoiceKey);
  const invoiceRef = db.collection(TrainerInvoiceCollection).doc(invoiceKey);
  const rejectedAt = zurichStoreDateTime(now);

  const done = await db.runTransaction(async (tx) => {
    // reads first
    const invoiceSnap = await tx.get(invoiceRef);
    const invoice = invoiceSnap.data();
    const tenants = Array.isArray(invoice?.['tenants']) ? (invoice?.['tenants'] as unknown[]) : [];
    if (!invoice || !tenants.includes(caller.tenantId)) throw new HttpsError('permission-denied', 'not allowed to manage this trainer invoice');
    const billKey = String(invoice['billKey'] ?? '');
    const billRef = billKey ? db.collection(BillCollection).doc(billKey) : undefined;
    const billSnap = billRef ? await tx.get(billRef) : undefined;
    const entrySnap = await tx.get(db.collection(WorkEntryCollection).where('invoiceKey', '==', invoiceKey));

    const refusal = rejectRefusal({ state: invoice['state'] as TrainerInvoiceState, billKey }, billSnap?.exists ? (billSnap.data() as { state: string; bookingKeys?: string[]; payments?: unknown[] }) : undefined);
    if (refusal) {
      throw new HttpsError('failed-precondition', refusal === 'not-sent' ? 'only a sent trainer invoice can be rejected' : 'the bill is already booked: delete the booking first', { reason: refusal });
    }

    // writes
    if (billRef && billSnap?.exists) tx.delete(billRef);
    tx.update(invoiceRef, { state: 'rejected', rejectedReason: reason, rejectedBy: caller.avatar, rejectedAt });
    for (const d of entrySnap.docs) tx.update(d.ref, { state: 'open', invoiceKey: '' });
    return {
      agreementKey: String(invoice['agreementKey'] ?? ''), personKey: String(invoice['personKey'] ?? ''), invoiceNo: String(invoice['invoiceNo'] ?? ''),
      month: String(invoice['month'] ?? ''), tenantId: caller.tenantId,
    };
  });

  await writeTrainerTask(db, invoiceKey, done, reason, rejectedAt, caller.avatar);
  logger.info(`${CF_NAME}: rejected ${invoiceKey} (${done.invoiceNo})`);
}

/**
 * «Trainerrechnung <Nr.> zurückgewiesen» for the trainer (assignee = the agreement's person) with the reason. One task per
 * rejection (the rejection time is in the id): a second rejection of a resent invoice gets a new task. Best effort:
 * the rejection has succeeded, a failure here is logged.
 */
async function writeTrainerTask(
  db: Firestore, invoiceKey: string, inv: { agreementKey: string; personKey: string; invoiceNo: string; month: string; tenantId: string },
  reason: string, rejectedAt: string, rejector: AvatarInfo,
): Promise<void> {
  try {
    const agreement = (await db.collection(TrainerAgreementCollection).doc(inv.agreementKey).get()).data();
    const person = (agreement?.['person'] as AvatarInfo | undefined) ?? { key: inv.personKey, name1: '', name2: '', modelType: 'person', type: '', subType: '', label: '' };
    await db.collection(TASK_COLLECTION).doc(`trainer-invoice-${invoiceKey}-rejected-${rejectedAt}`).set({
      tenants: [inv.tenantId], isArchived: false,
      name: `Trainerrechnung ${inv.invoiceNo} zurückgewiesen`.slice(0, 200), index: '', tags: '',
      notes: `Deine Rechnung ${inv.invoiceNo} für ${monthTitleDe(inv.month)} wurde zurückgewiesen. Grund: ${reason}\n\nBitte korrigiere die Einsätze und sende den Monat erneut.`,
      author: rejector, assignee: person,
      state: 'initial', dueDate: '', completionDate: '',
      priority: 'medium', importance: 'medium',
      calendars: [], rank: '', shareKey: '', parentKey: '',
      relatedModelType: 'trainerInvoice', relatedKey: `trainerInvoice.${invoiceKey}`,
      linkModelType: '', linkKey: '', links: [],
    });
  } catch (e) {
    logger.error(`${CF_NAME}: task for ${invoiceKey} not written`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

/** Callable: `{ invoiceKey, reason }`; refusals carry `details.reason`. */
export const rejectTrainerInvoice = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ invoiceKey: string; reason: string }>): Promise<void> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await rejectInvoice(getFirestore(), request.auth?.uid ?? '', request.data);
  },
);
