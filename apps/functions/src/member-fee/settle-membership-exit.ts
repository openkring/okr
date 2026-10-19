/**
 * Exit fee settlement, decision side (spec 1.105 §5): the treasurer's buttons on the settlement task.
 * `refund` creates a draft refund payment in the books' collecting order, `adjust-invoice` cancels the
 * native fee invoice and writes a pro-rata replacement draft, `extend` moves the exit to 31.12.
 *
 * The callable recomputes the settlement from current data and never trusts figures on the task. Every
 * write that decides the case (payment, replacement draft, membership) commits in ONE transaction with
 * the task being set done, so a second click or a second treasurer finds the done task and gets the
 * stored decision back; nothing is paid or sent here.
 *
 * `adjust-invoice` has a step outside that transaction (the storno, `cancelInvoiceCore`). It therefore
 * first CLAIMS the open task (`linkModelType 'invoice'`, `linkKey 'invoice.<original>'`); a claimed task
 * refuses every other choice ('adjust-in-progress') and offers only finishing the adjustment, which
 * also resumes a run that crashed after the storno.
 */
import { randomUUID } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { DocumentData, DocumentReference, Firestore, getFirestore, Transaction } from 'firebase-admin/firestore';

import {
  AddressCollection, AddressModel, InvoiceCollection, InvoiceModel, InvoicePositionCollection,
  InvoicePositionModel, MembershipCollection, PaymentCollection, PaymentOrderCollection, TaskCollection,
} from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, getTodayStr, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, pickFavoriteByChannel, scopeToTenant } from '@okr/shared-util-functions';
import { getInvoiceIndex, INVOICE_NOTES_LENGTH } from '@okr/finance-invoice-util';
import { SYSTEM_CREATOR } from '@okr/finance-payment-util';
import {
  computeExitSettlement, EXIT_SETTLEMENT_TAG, ExitSettlement, SettlementChoice, SettleResult,
} from '@okr/relationship-membership-util';

import { pickMemberIban } from '../expense/expense.util';
import { cancelInvoiceCore } from '../invoice/cancel-invoice';
import { totalRappen, withoutUndefined } from '../invoice/invoice.logic';
import { writeFinanceHistory } from '../finance-history/finance-history';
import { doneTaskDecision, ExitContext, isExitContext, loadExitContext, toInvoiceFacts } from './exit-settlement.context';
import {
  appendInvoiceNote, appendTaskNote, choiceRefusal, claimedChoices, claimedInvoiceKey, claimPatch, claimRefusal, decisionNote,
  emptySettlement, extendedRelLog, isLiveRefund, isValidClaim, membershipKeyOf, postalAddressText, refundDecision, refundInvoiceRefusal, refundMessageId, refundOrderId,
  refundPaymentId, refundReference, replacementInvoiceId, replacementPositions, stornoReason, withInvoice,
} from './settle-membership-exit.logic';

const REGION = 'europe-west6';
const CF_NAME = 'settleMembershipExit';
const PURPOSE = 'membership-refund';
const CHOICES: readonly (SettlementChoice | 'preview')[] = ['refund', 'adjust-invoice', 'extend', 'preview'];

export interface SettleData {
  taskKey: string;
  choice: SettlementChoice | 'preview';
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const tenantsOf = (d: DocumentData | undefined): string[] => (Array.isArray(d?.['tenants']) ? (d['tenants'] as string[]) : []);
const isDone = (t: DocumentData | undefined): boolean => str(t?.['state']) === 'done' || str(t?.['completionDate']) !== '';

/** Thrown inside a transaction when another call set the task done first. */
class TaskAlreadyDone extends Error {
  public constructor(public readonly notes: string) { super('task already done'); }
}

function refusal(reason: string, message = reason): HttpsError {
  return new HttpsError('failed-precondition', message, { reason });
}

export const settleMembershipExit = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<SettleData>): Promise<SettleResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid;

    const { taskKey, choice } = request.data ?? ({} as Partial<SettleData>);
    if (typeof taskKey !== 'string' || !taskKey.trim()) throw new HttpsError('invalid-argument', 'taskKey is required');
    if (!choice || !CHOICES.includes(choice)) throw new HttpsError('invalid-argument', `choice must be one of ${CHOICES.join(', ')}`);

    const db = getFirestore();
    const today = getTodayStr(DateFormat.StoreDate);

    // ---- the task ----
    const taskRef = db.collection(TaskCollection).doc(taskKey);
    const task = (await taskRef.get()).data();
    if (!task) throw new HttpsError('not-found', `task ${taskKey} not found`);
    if (!tenantsOf(task).includes(tenantId)) throw new HttpsError('permission-denied', 'task belongs to another tenant');
    if (!str(task['tags']).split(',').map(t => t.trim()).includes(EXIT_SETTLEMENT_TAG)) throw refusal('not-a-settlement-task');
    const membershipKey = membershipKeyOf(str(task['relatedKey']));
    if (!membershipKey) throw refusal('not-a-settlement-task', `task ${taskKey} is not about a membership`);

    // a done task always answers with its stored decision, even when the membership is gone
    if (isDone(task)) {
      const done = await loadExitContext(db, membershipKey, tenantId, today).catch(() => undefined);
      const settlement = isExitContext(done) ? computeExitSettlement(done.input) : emptySettlement();
      return { settlement, done: true, decision: doneTaskDecision(task) };
    }

    // ---- membership and books (the caller's tenant; books via ownerKey, never the org okey or the tenant) ----
    const ctx = await loadExitContext(db, membershipKey, tenantId, today);
    if (ctx === 'foreign-tenant') throw new HttpsError('permission-denied', 'membership belongs to another tenant');
    if (ctx === 'no-books') throw refusal('no-books', `membership ${membershipKey} has no unique books owned by its org in tenant ${tenantId}`);
    if (!isExitContext(ctx)) throw refusal('no-membership', `membership ${membershipKey} cannot be settled`);
    const books = ctx.input.booksId;

    const claimed = claimedInvoiceKey(task);
    const settlement = claimed ? await claimedSettlement(db, ctx, claimed) : computeExitSettlement(ctx.input);
    if (choice === 'preview') return { settlement, done: false };

    const claimRefused = claimRefusal(claimed, choice);
    if (claimRefused) throw refusal(claimRefused, `${choice} refused for task ${taskKey}: an invoice adjustment is in progress`);
    const existingRefund = choice === 'refund' && settlement.invoice ? await hasLiveRefund(db, tenantId, settlement.invoice.okey) : false;
    const refused = choiceRefusal(settlement, choice, false, existingRefund);
    if (refused) throw refusal(refused, `${choice} refused for task ${taskKey}: ${refused}`);

    const deciderName = await userName(db, uid);
    const note = decisionNote(choice, deciderName, convertDateFormatToString(today, DateFormat.StoreDate, DateFormat.ViewDate, false), settlement);
    const exitViewDate = convertDateFormatToString(ctx.membership.dateOfExit, DateFormat.StoreDate, DateFormat.ViewDate, false);
    const closeTask = { taskRef, today };

    let result: SettleResult;
    try {
      if (choice === 'refund') {
        const r = await refund(db, ctx, settlement, tenantId, note, exitViewDate, closeTask);
        result = { settlement, done: true, decision: r.decision, paymentKey: r.paymentKey, needsReview: r.needsReview };
      } else if (choice === 'adjust-invoice') {
        const r = await adjustInvoice(db, ctx, settlement, tenantId, uid, note, exitViewDate, closeTask);
        result = { settlement, done: true, decision: note, replacementInvoiceKey: r };
      } else {
        await extend(db, ctx, settlement, note, closeTask);
        result = { settlement, done: true, decision: note };
      }
    } catch (err) {
      if (err instanceof TaskAlreadyDone) return { settlement, done: true, decision: doneTaskDecision({ state: 'done', notes: err.notes }) };
      throw err;
    }

    await writeFinanceHistory(db, { tenantId, uid, parentKey: `membership.${membershipKey}`, kind: 'exitSettled', details: result.decision });
    logger.info(`${CF_NAME}: ${choice} for membership ${membershipKey} (task ${taskKey}, tenant ${tenantId}, books ${books})`);
    return result;
  },
);

/** First and last name of the caller (users/{uid}); '' when unknown. */
async function userName(db: Firestore, uid: string | undefined): Promise<string> {
  const user = uid ? (await db.collection('users').doc(uid).get()).data() : undefined;
  return [user?.['firstName'], user?.['lastName']].filter((s) => typeof s === 'string' && s.trim()).join(' ');
}

async function hasLiveRefund(db: Firestore, tenantId: string, invoiceKey: string): Promise<boolean> {
  const snap = await db.collection(PaymentCollection).where('invoiceKey', '==', invoiceKey).get();
  return snap.docs.some(d => tenantsOf(d.data()).includes(tenantId) && isLiveRefund(d.data()));
}

/**
 * The settlement of a claimed task. `linkKey` is client-writable, so the claimed invoice must pass
 * `isValidClaim` (this settlement's fee invoice, pending or cancelled, not replaced) and must be the
 * invoice the recomputation picks; otherwise 'invalid-claim' and nothing is done. A cancelled invoice
 * (storno ran, replacement did not) is left out by `loadExitContext`, so it is added back here. Only
 * finishing the adjustment is offered.
 */
async function claimedSettlement(db: Firestore, ctx: ExitContext, invoiceKey: string): Promise<ExitSettlement> {
  const invalid = (why: string): HttpsError => refusal('invalid-claim', `task claim for invoice ${invoiceKey} rejected: ${why}`);
  const usage = ctx.input.schedule?.positions.find(p => p.proRata)?.usage ?? '';
  const exitYear = Number(str(ctx.membership.dateOfExit).substring(0, 4)) || 0;
  const [invSnap, posSnap, replSnap] = await Promise.all([
    db.collection(InvoiceCollection).doc(invoiceKey).get(),
    db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey).get(),
    db.collection(InvoiceCollection).where('replacesInvoiceKey', '==', invoiceKey).get(),
  ]);
  const inv = invSnap.data();
  if (!inv) throw invalid('invoice not found');
  const facts = toInvoiceFacts(invoiceKey, inv,
    posSnap.docs.map(p => p.data()).filter(p => p['isArchived'] !== true && tenantsOf(p).includes(ctx.tenantId)));
  const replaced = !replSnap.empty || (await db.collection(InvoiceCollection).doc(replacementInvoiceId(invoiceKey)).get()).exists;
  const ok = isValidClaim(
    { facts, receiverKey: str((inv['receiver'] as { key?: unknown } | undefined)?.key), tenants: tenantsOf(inv), isArchived: inv['isArchived'] === true, replaced },
    { memberKey: str(ctx.membership.memberKey), tenantId: ctx.tenantId, books: ctx.input.booksId, usage, exitYear },
  );
  if (!ok) throw invalid('not this settlement\'s open fee invoice');
  const resumed = computeExitSettlement({ ...ctx.input, invoices: withInvoice(ctx.input.invoices.filter(i => i.okey !== invoiceKey), facts) });
  if (resumed.invoice?.okey !== invoiceKey) throw invalid('the settlement picks another invoice');
  return claimedChoices(resumed);
}

interface CloseTask { taskRef: DocumentReference; today: string }

/** Reads the task inside the transaction (a read, so call it before any write); throws when it is already done. */
async function readOpenTask(tx: Transaction, c: CloseTask): Promise<DocumentData> {
  const t = (await tx.get(c.taskRef)).data();
  if (!t || isDone(t)) throw new TaskAlreadyDone(str(t?.['notes']));
  return t;
}

/** Like readOpenTask, and refuses a task claimed by an invoice adjustment. */
async function readUnclaimedTask(tx: Transaction, c: CloseTask): Promise<DocumentData> {
  const t = await readOpenTask(tx, c);
  if (claimedInvoiceKey(t)) throw refusal('adjust-in-progress');
  return t;
}

function writeTaskDone(tx: Transaction, c: CloseTask, task: DocumentData, line: string, extra: Record<string, unknown> = {}): void {
  tx.update(c.taskRef, { state: 'done', completionDate: c.today, notes: appendTaskNote(str(task['notes']), line), ...extra });
}

/** §5.1: a draft refund payment in the books' collecting order, the invoice note and the task in one transaction. */
async function refund(
  db: Firestore, ctx: ExitContext, s: ExitSettlement, tenantId: string, note: string, exitViewDate: string, c: CloseTask,
): Promise<{ paymentKey: string; needsReview: boolean; decision: string }> {
  const books = ctx.input.booksId;
  const invoice = s.invoice;
  if (!invoice) throw refusal('choice-not-offered');
  const memberKey = str(ctx.membership.memberKey);
  const addresses = memberKey
    ? (await db.collection(AddressCollection).where('parentKey', '==', `person.${memberKey}`).get()).docs.map(d => ({ ...d.data(), okey: d.id }) as AddressModel)
    : [];
  const iban = pickMemberIban(addresses, tenantId);
  const needsReview = iban === '';
  const recipientAddress = postalAddressText(pickFavoriteByChannel(scopeToTenant(addresses, tenantId), 'postal'));
  const decision = refundDecision(note, needsReview);

  // The oldest open collecting order of these books wins; only when none exists does today's id decide.
  const open = await db.collection(PaymentOrderCollection).where('purpose', '==', PURPOSE).get();
  const existing = open.docs
    .filter(d => d.data()['status'] === 'draft' && d.data()['accountingTenantId'] === books && tenantsOf(d.data()).includes(tenantId))
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  const paymentKey = refundPaymentId(ctx.membershipKey, s.exitYear);
  const paymentRef = db.collection(PaymentCollection).doc(paymentKey);
  const invoiceRef = db.collection(InvoiceCollection).doc(invoice.okey);

  await db.runTransaction(async (tx) => {
    // ---- reads (all before the first write) ----
    const task = await readUnclaimedTask(tx, c);
    if ((await tx.get(paymentRef)).exists) throw refusal('already-refunded');
    const refunds = await tx.get(db.collection(PaymentCollection).where('invoiceKey', '==', invoice.okey));
    if (refunds.docs.some(d => tenantsOf(d.data()).includes(tenantId) && isLiveRefund(d.data()))) throw refusal('already-refunded');
    const inv = (await tx.get(invoiceRef)).data();
    const invRefused = refundInvoiceRefusal(inv, tenantId, books);
    if (invRefused || !inv) throw refusal(invRefused ?? 'state-changed');

    let orderId = '';
    let newOrder: { id: string; n: number } | undefined;
    if (existing) {
      const fresh = await tx.get(existing.ref);   // it may have been approved since the query
      if (fresh.data()?.['status'] === 'draft') orderId = existing.id;
    }
    for (let n = 1; !orderId; n++) {
      const id = refundOrderId(books, c.today, n);
      const snap = await tx.get(db.collection(PaymentOrderCollection).doc(id));
      if (!snap.exists) { orderId = id; newOrder = { id, n }; }
      else if (snap.data()?.['status'] === 'draft' && snap.data()?.['accountingTenantId'] === books && tenantsOf(snap.data()).includes(tenantId)) orderId = id;
    }

    // ---- writes ----
    if (newOrder) {
      tx.create(db.collection(PaymentOrderCollection).doc(newOrder.id), {
        tenants: [tenantId], isArchived: false, purpose: PURPOSE, status: 'draft',
        messageId: refundMessageId(books, c.today, newOrder.n), deliveryMethod: 'pain001_download',
        debitAccountKey: '', executionDate: '', pain001Xml: '', createdBy: SYSTEM_CREATOR, approvedBy: '',
        accountingTenantId: books,
      });
    }
    tx.create(paymentRef, {
      tenants: [tenantId], isArchived: false, paymentOrderKey: orderId, billKey: '',
      endToEndId: randomUUID().replace(/-/g, '').slice(0, 32),
      amount: { amount: s.refundRappen, currency: 'CHF', periodicity: 'one-time' },
      recipientName: ctx.memberLabel, recipientIban: iban, recipientBic: '', recipientAddress,
      reference: refundReference(s.exitYear), referenceType: 'NON',
      status: 'draft', reasonCode: '', bookingKey: '', accountingTenantId: books,
      expenseKey: '', ocrResultKey: '', invoiceKey: invoice.okey, needsReview,
    });
    tx.update(invoiceRef, { notes: appendInvoiceNote(str(inv['notes']), s.refundRappen, exitViewDate, INVOICE_NOTES_LENGTH) });
    writeTaskDone(tx, c, task, decision);
  });
  return { paymentKey, needsReview, decision };
}

/**
 * §5.2 in three steps: (1) claim the open task for the original invoice, (2) cancel the invoice,
 * (3) write the pro-rata replacement draft and close the task in one transaction that requires the
 * claim to still be ours. A failed storno that left the invoice uncancelled releases the claim and
 * rethrows; nothing else is written.
 */
async function adjustInvoice(
  db: Firestore, ctx: ExitContext, s: ExitSettlement, tenantId: string, uid: string | undefined, note: string, exitViewDate: string, c: CloseTask,
): Promise<string> {
  const original = s.invoice;
  const usage = ctx.input.schedule?.positions.find(p => p.proRata)?.usage;
  if (!original || s.shape !== 'native' || !usage) throw refusal('choice-not-offered');
  const claim = claimPatch(original.okey);

  // (1) claim
  await db.runTransaction(async (tx) => {
    const t = await readOpenTask(tx, c);
    const current = claimedInvoiceKey(t);
    if (current && current !== original.okey) throw refusal('state-changed', `task is claimed for invoice ${current}`);
    if (!current) tx.update(c.taskRef, claim);
  });

  const invoiceRef = db.collection(InvoiceCollection).doc(original.okey);
  const inv = (await invoiceRef.get()).data();
  if (!inv) throw new HttpsError('not-found', `invoice ${original.okey} not found`);
  const posSnap = await db.collection(InvoicePositionCollection).where('invoiceKey', '==', original.okey).get();
  const positions = replacementPositions(
    posSnap.docs.map(d => d.data()).filter(p => p['isArchived'] !== true && tenantsOf(p).includes(tenantId)),
    usage, s.exitYear, s.dueFr, s.months, s.yearlyFr,
  );

  // (2) storno — idempotent: a resumed run finds the storno booking and gets the stored result
  try {
    await cancelInvoiceCore(db, { tenantId, uid, invoiceKey: original.okey, reason: stornoReason(exitViewDate), date: c.today });
  } catch (err) {
    await releaseClaimIfNotCancelled(db, c, invoiceRef, claim.linkKey);
    throw err;
  }

  // (3) replacement + task done
  const replKey = replacementInvoiceId(original.okey);
  const replRef = db.collection(InvoiceCollection).doc(replKey);
  const invoice = new InvoiceModel(tenantId);
  invoice.tenants = tenantsOf(inv).length ? tenantsOf(inv) : [tenantId];
  invoice.tags = str(inv['tags']);
  invoice.title = str(inv['title']);
  invoice.receiver = inv['receiver'] as InvoiceModel['receiver'];
  invoice.accountingTenantId = str(inv['accountingTenantId']);
  if (inv['vatType']) invoice.vatType = inv['vatType'] as InvoiceModel['vatType'];
  invoice.notes = `Ersetzt Rechnung ${original.invoiceId}: ${stornoReason(exitViewDate)}`;
  invoice.state = 'draft';
  invoice.invoiceNo = 0;
  invoice.invoiceId = '';
  invoice.invoiceDate = c.today;
  invoice.dueDate = addDuration(c.today, { days: 30 });
  invoice.replacesInvoiceKey = original.okey;
  invoice.totalAmount = {
    amount: totalRappen(positions.map(p => ({ type: str(p['invoicePositionType']), name: str(p['name']), amount: Number(p['amount']) || 0, accountKey: str(p['accountKey']) }))),
    currency: 'CHF', periodicity: 'one-time',
  };
  invoice.index = getInvoiceIndex(invoice);

  await db.runTransaction(async (tx) => {
    const t = await readOpenTask(tx, c);
    if (claimedInvoiceKey(t) !== original.okey) throw refusal('state-changed', `task lost its claim for invoice ${original.okey}`);
    const exists = (await tx.get(replRef)).exists;
    if (!exists) {
      tx.create(replRef, withoutUndefined(removeKeyFromOkrModel(invoice)));
      positions.forEach((p, index) => {
        const position = Object.assign(new InvoicePositionModel(tenantId), p);
        position.tenants = invoice.tenants;
        position.invoiceKey = replKey;
        position.sortOrder = index;
        tx.set(db.collection(InvoicePositionCollection).doc(`${replKey}-${index}`), withoutUndefined(removeKeyFromOkrModel(position)));
      });
    }
    // the done task links to the draft the treasurer reviews next
    writeTaskDone(tx, c, t, note, claimPatch(replKey));
  });
  return replKey;
}

/** After a failed storno: drop our claim, but only when the invoice is verifiably not cancelled. */
async function releaseClaimIfNotCancelled(db: Firestore, c: CloseTask, invoiceRef: DocumentReference, linkKey: string): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const inv = (await tx.get(invoiceRef)).data();
      const t = (await tx.get(c.taskRef)).data();
      if (!inv || str(inv['state']) === 'cancelled' || !t || isDone(t) || str(t['linkKey']) !== linkKey) return;
      tx.update(c.taskRef, { linkKey: '', linkModelType: '' });
    });
  } catch (e) {
    logger.error(`${CF_NAME}: claim on task ${c.taskRef.id} not released`, e);
  }
}

/**
 * §5.3: exit on 31.12. The task is set done in the same commit as the membership update, so the trigger
 * that this update fires already finds the task done and leaves it alone.
 */
async function extend(db: Firestore, ctx: ExitContext, s: ExitSettlement, note: string, c: CloseTask): Promise<void> {
  const membershipRef = db.collection(MembershipCollection).doc(ctx.membershipKey);
  await db.runTransaction(async (tx) => {
    const task = await readUnclaimedTask(tx, c);
    const m = (await tx.get(membershipRef)).data();
    if (!m || str(m['dateOfExit']) !== str(ctx.membership.dateOfExit)) throw refusal('state-changed', `membership ${ctx.membershipKey} changed meanwhile`);
    writeTaskDone(tx, c, task, note);
    tx.update(membershipRef, { dateOfExit: `${s.exitYear}1231`, relLog: extendedRelLog(str(m['relLog']), s.exitYear) });
  });
}
