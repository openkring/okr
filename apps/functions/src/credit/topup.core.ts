// apps/functions/src/credit/topup.core.ts
//
// Top-ups of the prepaid credit (plan 1.149 Task 9): the top-up invoice in the operator books, the off-session
// charge of an auto top-up, and the credit once a top-up invoice is paid (Stripe and QR bill alike). The
// callables and triggers are thin shells around these; every step is idempotent.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { PaymentAttemptCollection, PaymentAttemptModel, SubscriptionCollection } from '@okr/shared-models';
import type { AutoTopUp, AvatarInfo, SavedPaymentMethod } from '@okr/shared-models';

import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { loadOwnedAccountingConfig, refuse } from '../invoice/invoice-context';
import { platformBilling } from '../collection/platform';
import type { StripePort } from '../collection/stripe-port';
import { toStoreDateTime } from '../srv/zurich-time';
import { applyCreditEntry } from './credit-ledger';
import {
  AUTO_TOPUP_REQUEST_ID, autoTopUpCollectionPath, autoTopUpInvoiceKey, pendingInvoiceRerunnable, topUpAmountRefusal,
} from './auto-topup.logic';

const TOPUP_DUE_DAYS = 10;

type Log = (level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) => void;

/** orgs/{tenantId} as the invoice receiver. */
export async function tenantOrgAvatar(db: Firestore, tenantId: string): Promise<AvatarInfo> {
  const org = (await db.collection('orgs').doc(tenantId).get()).data() ?? {};
  return { key: tenantId, name1: '', name2: String(org['name'] ?? tenantId), modelType: 'org', type: '', subType: '', label: '' };
}

/**
 * Issues a top-up invoice of `amount` Rappen to tenant `tenantId` in the operator books: one position on the
 * books' prepaymentAccountKey, due in 10 days. Idempotent on `okey`. Refuses an amount outside MIN/MAX_TOPUP.
 */
export async function issueTopUpInvoice(db: Firestore, input: { tenantId: string; amount: number; okey: string; actor: string }): Promise<{
  invoiceKey: string; invoiceNo: number; operatorTenantId: string; accountingTenantId: string;
}> {
  const refusal = topUpAmountRefusal(input.amount);
  if (refusal) throw new HttpsError('invalid-argument', refusal);
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, input.okey, accountingTenantId);
  const prepaymentKey = String(config['prepaymentAccountKey'] ?? '');
  if (!prepaymentKey) throw refuse('credit-accounts-missing', `${accountingTenantId} has no prepaymentAccountKey: credit is not set up`);
  const receiver = await tenantOrgAvatar(db, input.tenantId);
  const { invoiceKey, invoiceNo } = await createAndIssueInvoice(db, {
    okey: input.okey, tenantId: operatorTenantId, accountingTenantId, receiver,
    title: `Guthaben-Aufladung ${receiver.name2}`, billingKind: 'topup',
    positions: [{ title: 'Guthaben-Aufladung', amount: input.amount, accountKey: prepaymentKey }],
    dueDays: TOPUP_DUE_DAYS, actor: input.actor,
  });
  return { invoiceKey, invoiceNo, operatorTenantId, accountingTenantId };
}

const requestRef = (db: Firestore, tenantId: string) => db.collection(autoTopUpCollectionPath(tenantId)).doc(AUTO_TOPUP_REQUEST_ID);

/** Clears the auto top-up request; with `invoiceKey`, only while that invoice is the pending one. */
export async function clearAutoTopUp(db: Firestore, tenantId: string, invoiceKey?: string): Promise<void> {
  const ref = requestRef(db, tenantId);
  await db.runTransaction(async tx => {
    const request = (await tx.get(ref)).data();
    if (!request) return;
    if (invoiceKey !== undefined && String(request['pendingInvoiceKey'] ?? '') !== invoiceKey) return;
    tx.set(ref, { requestedAt: '', pendingInvoiceKey: '' });
  });
}

/** Statuses of an off-session PaymentIntent after which the money is (or will be) on its way. */
const CHARGE_ON_ITS_WAY = ['succeeded', 'processing'];
const SETTLED_ATTEMPT_STATES = ['succeeded', 'overpaid'];

export type AutoTopUpOutcome = 'charged' | 'declined' | 'skipped';

/**
 * Runs one auto top-up request (`requestedAt` and the request's `pendingInvoiceKey`, from
 * credit-accounts/{tenantId}/auto-top-up/request). The credit itself is written by the topup-paid trigger once the
 * webhook has recorded the payment.
 *
 * - A request over a stale pending invoice (older than 24 h) charges THAT invoice again, with the same okey and the
 *   same Stripe idempotency key; a pending invoice that is paid or cancelled meanwhile just clears the request.
 * - Otherwise a new invoice `topup-<tenantId>-<requestedAt>` is issued, marked pending, and charged off-session.
 * - Anything failing BEFORE the charge is called clears the request (the next deduction asks again). A charge call
 *   that throws (network) keeps the pending state: the webhook or the 24 h staleness resolves it.
 * - A declined charge clears the request; the webhook (payment_intent.payment_failed) switches auto top-up off and
 *   tells the admin.
 */
export async function runAutoTopUp(
  db: Firestore, port: Pick<StripePort, 'chargeOffSession'>, tenantId: string, request: { requestedAt: string; pendingInvoiceKey: string }, log: Log,
): Promise<AutoTopUpOutcome> {
  let charge: Parameters<StripePort['chargeOffSession']>[0];
  let attemptKey: string;
  let invoiceKey: string;
  try {
    const prepared = await prepareAutoTopUp(db, tenantId, request, log);
    if (prepared === 'skipped') return 'skipped';
    ({ charge, attemptKey, invoiceKey } = prepared);
  } catch (err) {
    await clearAutoTopUp(db, tenantId);
    throw err;
  }

  // From here on the charge may have reached Stripe: never clear on a thrown error.
  const pi = await port.chargeOffSession(charge);
  await db.collection(PaymentAttemptCollection).doc(attemptKey).update({
    stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId, updatedAt: toStoreDateTime(new Date()),
  });
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    log('info', 'autoTopUp: charged', { tenantId, invoiceKey, amount: charge.amount, status: pi.status });
    return 'charged';
  }
  await clearAutoTopUp(db, tenantId, invoiceKey);
  log('warn', 'autoTopUp: charge declined', { tenantId, invoiceKey, status: pi.status });
  return 'declined';
}

/** Everything before the charge: settings, invoice (new or the stale pending one), pending mark, attempt. */
async function prepareAutoTopUp(
  db: Firestore, tenantId: string, request: { requestedAt: string; pendingInvoiceKey: string }, log: Log,
): Promise<'skipped' | { charge: Parameters<StripePort['chargeOffSession']>[0]; attemptKey: string; invoiceKey: string }> {
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data() ?? {};
  const settings = (sub['autoTopUp'] ?? {}) as Partial<AutoTopUp>;
  const method = sub['paymentMethod'] as SavedPaymentMethod | null | undefined;
  const customerId = String(sub['stripeCustomerId'] ?? '');
  let amount = Number(settings.amount ?? 0);
  if (!settings.enabled || sub['autopay'] !== true || !method?.stripePaymentMethodId || !customerId || topUpAmountRefusal(amount)) {
    log('warn', 'autoTopUp: request dropped, auto top-up is not ready', { tenantId, enabled: !!settings.enabled, autopay: sub['autopay'] === true, amount });
    await clearAutoTopUp(db, tenantId);
    return 'skipped';
  }

  let okey = autoTopUpInvoiceKey(tenantId, request.requestedAt);
  if (request.pendingInvoiceKey) {
    const stale = (await db.collection('invoices').doc(request.pendingInvoiceKey).get()).data();
    if (!stale || !pendingInvoiceRerunnable(stale['state'])) {
      log('info', 'autoTopUp: stale pending top-up is settled, request cleared', { tenantId, invoiceKey: request.pendingInvoiceKey, state: stale?.['state'] });
      await clearAutoTopUp(db, tenantId);
      return 'skipped';
    }
    okey = request.pendingInvoiceKey;
    // the same invoice: its own amount, not today's setting (createAndIssueInvoice refuses a different total)
    amount = Number((stale['totalAmount'] as { amount?: number } | undefined)?.amount ?? amount);
    log('warn', 'autoTopUp: re-running a stale pending top-up', { tenantId, invoiceKey: okey });
  }
  const { invoiceKey, invoiceNo, operatorTenantId, accountingTenantId } = await issueTopUpInvoice(db, { tenantId, amount, okey, actor: 'system' });

  // Pending before the charge: a fast webhook may credit (and clear) the top-up before chargeOffSession returns.
  await requestRef(db, tenantId).set({ requestedAt: request.requestedAt, pendingInvoiceKey: invoiceKey });

  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${invoiceKey}`);
  const now = toStoreDateTime(new Date());
  const existing = (await attemptRef.get()).data();
  if (!existing) {
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId: tenantId, accountingTenantId, purpose: 'topup', invoiceKey, amount, offSession: true,
      createdBy: 'system', state: 'open', createdAt: now, updatedAt: now,
    });
  } else if (SETTLED_ATTEMPT_STATES.includes(String(existing['state']))) {
    // paid by an earlier run whose webhook already posted it; the invoice trigger credits and clears
    log('info', 'autoTopUp: the pending top-up is already paid', { tenantId, invoiceKey });
    return 'skipped';
  }

  return {
    attemptKey: attemptRef.id,
    invoiceKey,
    charge: {
      customerId, paymentMethodId: method.stripePaymentMethodId, amount,
      description: `Guthaben-Aufladung, Rechnung ${invoiceNo}`,
      metadata: { attemptKey: attemptRef.id, tenantId, accountingTenantId, purpose: 'topup', invoiceKey },
      idempotencyKey: invoiceKey,
    },
  };
}

/**
 * Credits a paid top-up invoice to its receiver tenant (entry `topup-<invoiceKey>`), once. Refuses (false) an
 * invoice outside the operator books or whose receiver is not a tenant. Clears a pending auto top-up of it.
 */
export async function creditPaidTopUp(db: Firestore, invoiceKey: string, invoice: Record<string, unknown>, log: Log): Promise<boolean> {
  const tenantId = String((invoice['receiver'] as { key?: string } | undefined)?.key ?? '');
  const { accountingTenantId } = await platformBilling(db);
  if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId) {
    log('error', 'topUpPaid: top-up invoice outside the operator books, not credited', { invoiceKey, books: invoice['accountingTenantId'] });
    return false;
  }
  if (!tenantId || !(await db.collection('app-config').doc(tenantId).get()).exists) {
    log('error', 'topUpPaid: top-up receiver is not a tenant, not credited', { invoiceKey, receiver: tenantId });
    return false;
  }
  const amount = Number((invoice['totalAmount'] as { amount?: number } | undefined)?.amount ?? 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    log('error', 'topUpPaid: top-up invoice has no amount, not credited', { invoiceKey, amount });
    return false;
  }
  const { balanceAfter, duplicate } = await applyCreditEntry(db, tenantId, `topup-${invoiceKey}`, {
    kind: 'topup', amount, date: toStoreDateTime(new Date()), product: '', units: 0, pages: 0, unitPrice: 0, pagePrice: 0,
    reference: invoiceKey, reason: 'Aufladung', createdBy: 'system',
  });
  await clearAutoTopUp(db, tenantId, invoiceKey);
  log('info', 'topUpPaid: credited', { invoiceKey, tenantId, amount, balanceAfter, duplicate });
  return true;
}
