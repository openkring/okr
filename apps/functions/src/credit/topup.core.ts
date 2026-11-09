// apps/functions/src/credit/topup.core.ts
//
// Top-ups of the prepaid credit (plan 1.149 Task 9): the top-up invoice in the operator books, the off-session
// charge of an auto top-up, and the credit once a top-up invoice is paid (Stripe and QR bill alike). The
// callables and triggers are thin shells around these; every step is idempotent.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, PaymentAttemptCollection, PaymentAttemptModel, SubscriptionCollection } from '@okr/shared-models';
import type { AutoTopUp, AvatarInfo, SavedPaymentMethod } from '@okr/shared-models';

import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { loadOwnedAccountingConfig, refuse } from '../invoice/invoice-context';
import { platformBilling } from '../collection/platform';
import type { StripePort } from '../collection/stripe-port';
import { toStoreDateTime } from '../srv/zurich-time';
import { applyCreditEntry } from './credit-ledger';
import { autoTopUpInvoiceKey, topUpAmountRefusal } from './auto-topup.logic';

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

/** Clears the auto top-up request; with `invoiceKey`, only while that invoice is the pending one. */
export async function clearAutoTopUp(db: Firestore, tenantId: string, invoiceKey?: string): Promise<void> {
  const ref = db.collection(CreditAccountCollection).doc(tenantId);
  await db.runTransaction(async tx => {
    const account = (await tx.get(ref)).data();
    if (!account) return;
    if (invoiceKey !== undefined && String(account['autoTopUpPendingInvoiceKey'] ?? '') !== invoiceKey) return;
    tx.update(ref, { autoTopUpRequestedAt: '', autoTopUpPendingInvoiceKey: '' });
  });
}

/** Statuses of an off-session PaymentIntent after which the money is (or will be) on its way. */
const CHARGE_ON_ITS_WAY = ['succeeded', 'processing'];

/**
 * Runs one auto top-up request (`requestedAt` from credit-accounts/{tenantId}): issues the top-up invoice, writes
 * the payment attempt, marks it pending and charges the saved method off-session (idempotency key = invoice key).
 * The credit itself is written by the topup-paid trigger once the webhook has recorded the payment. A request
 * that cannot run (switched off meanwhile, no saved method) or a declined charge clears the request; a decline
 * is also reported by the webhook (payment_intent.payment_failed), which switches auto top-up off and tells the admin.
 */
export async function runAutoTopUp(
  db: Firestore, port: Pick<StripePort, 'chargeOffSession'>, tenantId: string, requestedAt: string, log: Log,
): Promise<'charged' | 'declined' | 'skipped'> {
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data() ?? {};
  const settings = (sub['autoTopUp'] ?? {}) as Partial<AutoTopUp>;
  const method = sub['paymentMethod'] as SavedPaymentMethod | null | undefined;
  const customerId = String(sub['stripeCustomerId'] ?? '');
  const amount = Number(settings.amount ?? 0);
  if (!settings.enabled || sub['autopay'] !== true || !method?.stripePaymentMethodId || !customerId || topUpAmountRefusal(amount)) {
    log('warn', 'autoTopUp: request dropped, auto top-up is not ready', { tenantId, enabled: !!settings.enabled, autopay: sub['autopay'] === true, amount });
    await clearAutoTopUp(db, tenantId);
    return 'skipped';
  }

  const okey = autoTopUpInvoiceKey(tenantId, requestedAt);
  const { invoiceKey, invoiceNo, operatorTenantId, accountingTenantId } = await issueTopUpInvoice(db, { tenantId, amount, okey, actor: 'system' });

  // Pending before the charge: a fast webhook may credit (and clear) the top-up before chargeOffSession returns.
  await db.collection(CreditAccountCollection).doc(tenantId).update({ autoTopUpPendingInvoiceKey: invoiceKey });

  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${invoiceKey}`);
  const now = toStoreDateTime(new Date());
  if (!(await attemptRef.get()).exists) {
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId: tenantId, accountingTenantId, purpose: 'topup', invoiceKey, amount, offSession: true,
      createdBy: 'system', state: 'open', createdAt: now, updatedAt: now,
    });
  }

  const pi = await port.chargeOffSession({
    customerId, paymentMethodId: method.stripePaymentMethodId, amount,
    description: `Guthaben-Aufladung, Rechnung ${invoiceNo}`,
    metadata: { attemptKey: attemptRef.id, tenantId, accountingTenantId, purpose: 'topup', invoiceKey },
    idempotencyKey: invoiceKey,
  });
  await attemptRef.update({ stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId, updatedAt: toStoreDateTime(new Date()) });
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    log('info', 'autoTopUp: charged', { tenantId, invoiceKey, amount, status: pi.status });
    return 'charged';
  }
  await clearAutoTopUp(db, tenantId, invoiceKey);
  log('warn', 'autoTopUp: charge declined', { tenantId, invoiceKey, status: pi.status });
  return 'declined';
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
