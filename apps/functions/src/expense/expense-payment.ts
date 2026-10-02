import { randomUUID } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { PaymentCollection, PaymentOrderCollection, OcrResultCollection } from '@okr/shared-models';
import { buildExpensePayments, ExpensePaymentSource, SYSTEM_CREATOR } from '@okr/finance-payment-util';
import { getTodayStr, DateFormat } from '@okr/shared-util-core';

import { emitEvent } from '../workflow/emit';
import { collectingMessageId, collectingOrderId, expensePaymentId, expensePaymentTransition, isLiveDone } from './expense.util';

const REGION = 'europe-west6';
const PURPOSE = 'expense-reimbursement';

/**
 * Draft payments for a completed expense (spec 1.80 §4). Creates on the move into `done`
 * (task path and manual path alike), withdraws on the move out. Never touches the expense:
 * a failure here only means the treasurer pays by hand.
 */
export const onExpenseDone = onDocumentUpdated(
  { document: 'expenses/{expenseKey}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const transition = expensePaymentTransition(before, after);
    if (transition === 'none' || !after) return;
    const expenseKey = event.params['expenseKey'] as string;
    const tenantId = ((after['tenants'] as string[] | undefined) ?? [])[0] ?? '';
    if (!tenantId) return;
    try {
      if (transition === 'create') await createPayments(tenantId, expenseKey, after);
      else await withdrawPayments(tenantId, expenseKey, after);
    } catch (err) {
      logger.error(`onExpenseDone: ${transition} failed for expense ${expenseKey}`, err);
    }
  },
);

async function loadSources(tenantId: string, expenseKey: string): Promise<ExpensePaymentSource[]> {
  const snap = await getFirestore().collection(OcrResultCollection).where('correlationKey', '==', expenseKey).get();
  return snap.docs
    .filter(d => ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
    .filter(d => d.data()['isArchived'] !== true && d.data()['status'] !== 'failed')
    .map(d => ({ okey: d.id, ...(d.data() as Omit<ExpensePaymentSource, 'okey'>) }));
}

async function createPayments(tenantId: string, expenseKey: string, expense: DocumentData): Promise<void> {
  const db = getFirestore();
  const sources = (expense['transferTo'] ?? 'me') === 'issuer' ? await loadSources(tenantId, expenseKey) : [];
  const plan = buildExpensePayments({ okey: expenseKey, ...expense }, sources);
  if (plan.manual.length) logger.info(`onExpenseDone: ${expenseKey} needs manual payment for [${plan.manual.join(', ')}]`);
  if (plan.drafts.length === 0) return;

  // The oldest open collecting order wins; only when none exists does today's deterministic id decide.
  const open = await db.collection(PaymentOrderCollection).where('purpose', '==', PURPOSE).get();
  const existing = open.docs
    .filter(d => d.data()['status'] === 'draft' && ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  // Firestore transactions require every read before the first write: read payments and order
  // candidates first, write afterwards.
  const created = await db.runTransaction(async (tx) => {
    const expenseSnap = await tx.get(db.collection('expenses').doc(expenseKey));
    const refs = plan.drafts.map(d => db.collection(PaymentCollection).doc(expensePaymentId(expenseKey, d.ocrResultKey)));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    // Out-of-order delivery: the expense may have been reopened since this event was raised.
    if (!isLiveDone(expenseSnap.data() as { status?: string; isArchived?: boolean } | undefined)) return 0;
    const missing = plan.drafts.map((d, i) => ({ d, ref: refs[i] })).filter((_, i) => !snaps[i].exists);
    if (missing.length === 0) return 0;   // redelivery / re-entry: never open an empty collecting order

    let orderId = '';
    let newOrder: { id: string; n: number } | undefined;
    if (existing) {
      const fresh = await tx.get(existing.ref);   // it may have been approved since the query
      if (fresh.data()?.['status'] === 'draft') orderId = existing.id;
    }
    const today = getTodayStr(DateFormat.StoreDate);
    for (let n = 1; !orderId; n++) {
      const id = collectingOrderId(tenantId, today, n);
      const snap = await tx.get(db.collection(PaymentOrderCollection).doc(id));
      if (!snap.exists) { orderId = id; newOrder = { id, n }; }
      else if (snap.data()?.['status'] === 'draft') orderId = id;
    }

    // ---- writes ----
    if (newOrder) {
      tx.create(db.collection(PaymentOrderCollection).doc(newOrder.id), {
        tenants: [tenantId], isArchived: false, purpose: PURPOSE, status: 'draft',
        messageId: collectingMessageId(tenantId, today, newOrder.n), deliveryMethod: 'pain001_download',
        debitAccountKey: '', executionDate: '', pain001Xml: '', createdBy: SYSTEM_CREATOR, approvedBy: '',
        accountingTenantId: tenantId,
      });
    }
    for (const { d, ref } of missing) {
      tx.create(ref, {
        tenants: [tenantId], isArchived: false, paymentOrderKey: orderId, billKey: '',
        endToEndId: randomUUID().replace(/-/g, '').slice(0, 32),
        amount: { amount: d.amount, currency: d.currency, periodicity: 'one-time' },
        recipientName: d.recipientName, recipientIban: d.recipientIban, recipientBic: '',
        recipientAddress: d.recipientAddress, reference: d.reference, referenceType: d.referenceType,
        status: 'draft', reasonCode: '', bookingKey: '', accountingTenantId: tenantId,
        expenseKey, ocrResultKey: d.ocrResultKey, needsReview: d.needsReview,
      });
    }
    return missing.length;
  });
  logger.info(`onExpenseDone: ${created} draft payment(s) for expense ${expenseKey}`);
}

async function withdrawPayments(tenantId: string, expenseKey: string, expense: DocumentData): Promise<void> {
  const db = getFirestore();
  const payments = await db.collection(PaymentCollection).where('expenseKey', '==', expenseKey).get();
  for (const p of payments.docs) {
    if (!((p.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId)) continue;
    // Re-read payment and order inside one transaction (reads before writes): an approval that lands
    // between the query and the delete aborts the delete instead of removing an approved payment.
    const orphan = await db.runTransaction(async (tx) => {
      const pay = await tx.get(p.ref);
      if (!pay.exists) return undefined;
      const orderKey = (pay.data()?.['paymentOrderKey'] as string | undefined) ?? '';
      const order = orderKey ? await tx.get(db.collection(PaymentOrderCollection).doc(orderKey)) : undefined;
      if (!order?.exists || order.data()?.['status'] === 'draft') {
        tx.delete(p.ref);
        return undefined;
      }
      return {
        amount: (pay.data()?.['amount'] as { amount?: number; currency?: string } | undefined) ?? {},
        messageId: (order.data()?.['messageId'] as string | undefined) ?? '',
      };
    });
    if (!orphan) continue;
    await emitEvent('expense.paymentOrphaned', tenantId, `expense.${expenseKey}`, {
      personKey: (expense['personKey'] as string) ?? '',
      subjectName: (expense['userName'] as string) ?? '',
      params: {
        amount: ((orphan.amount.amount ?? 0) / 100).toFixed(2),
        currency: orphan.amount.currency ?? 'CHF',
        order: orphan.messageId,
      },
    });
  }
}
