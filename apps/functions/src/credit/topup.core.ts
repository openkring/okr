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
import { PI_IN_FLIGHT } from '../collection/stripe-port';
import type { StripePort } from '../collection/stripe-port';
import { settleSucceededPayment } from '../collection/stripe-webhook';
import type { StripeHandlerPort } from '../collection/stripe-webhook';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { autoTopUpRequestRef, clearAutoTopUp } from './auto-topup-request';
import { applyCreditEntry } from './credit-ledger';
import {
  autoTopUpInvoiceKey, pendingInvoiceRerunnable, topUpAmountRefusal,
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

/** Statuses of an off-session PaymentIntent after which the money is (or will be) on its way. */
const CHARGE_ON_ITS_WAY = ['succeeded', 'processing'];
const SETTLED_ATTEMPT_STATES = ['succeeded', 'overpaid'];

export type AutoTopUpOutcome = 'charged' | 'declined' | 'skipped';

/** What the auto top-up needs of Stripe: the charge, reading a PaymentIntent back, and the webhook's settle path. */
export type AutoTopUpPort = Pick<StripePort, 'chargeOffSession' | 'retrievePaymentIntent' | 'findPaymentIntentByInvoiceKey'> & StripeHandlerPort;

type AutoTopUpRequest = { requestedAt: string; pendingInvoiceKey: string; retryCount?: number };

/**
 * Runs one auto top-up request (`requestedAt` and the request's `pendingInvoiceKey`, from
 * credit-accounts/{tenantId}/auto-top-up/request). The credit itself is written by the topup-paid trigger once the
 * payment is recorded on the invoice.
 *
 * - A new request issues `topup-<tenantId>-<requestedAt>`, marks it pending and charges it (idempotency key = invoice key).
 * - A request over a stale pending invoice (older than 24 h) re-runs THAT invoice (same okey). Stripe's idempotency
 *   window is 24 h too, so before any re-charge the earlier PaymentIntent is read back (by the attempt's id, else by
 *   a search on metadata.invoiceKey — the charge call may have thrown after Stripe created it):
 *   - succeeded → recorded through the webhook's settle path (payment, fee, attempt), no charge;
 *   - still in flight (processing, requires_action, …) → no charge, the request stays pending;
 *   - requires_payment_method / canceled / none → charged again with key `<invoiceKey>-r<n>` (n counted on the request).
 *   A pending invoice paid or cancelled meanwhile just clears the request.
 * - Anything failing BEFORE the charge call clears the request; a charge call that throws keeps it pending.
 * - A declined charge clears the request; the webhook switches auto top-up off and tells the admin.
 */
export async function runAutoTopUp(
  db: Firestore, port: AutoTopUpPort, tenantId: string, request: AutoTopUpRequest, log: Log,
): Promise<AutoTopUpOutcome> {
  let prepared: Awaited<ReturnType<typeof prepareAutoTopUp>>;
  try {
    prepared = await prepareAutoTopUp(db, port, tenantId, request, log);
  } catch (err) {
    await clearAutoTopUp(db, tenantId);
    throw err;
  }
  if (prepared === 'skipped') return 'skipped';
  const { charge, attemptKey, invoiceKey } = prepared;

  // From here on the charge may have reached Stripe: never clear on a thrown error.
  const pi = await port.chargeOffSession(charge);
  await db.collection(PaymentAttemptCollection).doc(attemptKey).update({
    stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId, updatedAt: toStoreDateTime(new Date()),
  });
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    log('info', 'autoTopUp: charged', { tenantId, invoiceKey, amount: charge.amount, status: pi.status, idempotencyKey: charge.idempotencyKey });
    return 'charged';
  }
  await clearAutoTopUp(db, tenantId, invoiceKey);
  log('warn', 'autoTopUp: charge declined', { tenantId, invoiceKey, status: pi.status });
  return 'declined';
}

/** Everything before the charge: settings, invoice (new or the stale pending one), the earlier charge, pending mark, attempt. */
async function prepareAutoTopUp(
  db: Firestore, port: AutoTopUpPort, tenantId: string, request: AutoTopUpRequest, log: Log,
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

  const rerun = request.pendingInvoiceKey !== '';
  let okey = autoTopUpInvoiceKey(tenantId, request.requestedAt);
  if (rerun) {
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

  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${invoiceKey}`);
  const existing = (await attemptRef.get()).data();
  if (existing && SETTLED_ATTEMPT_STATES.includes(String(existing['state']))) {
    // paid by an earlier run whose webhook already posted it; the invoice trigger credits and clears
    log('info', 'autoTopUp: the pending top-up is already paid', { tenantId, invoiceKey });
    return 'skipped';
  }

  let retryCount = Number(request.retryCount ?? 0);
  let idempotencyKey = invoiceKey;
  if (rerun && existing) {
    const earlierId = String(existing['stripePaymentIntentId'] ?? '');
    const earlier = earlierId ? await port.retrievePaymentIntent(earlierId) : await port.findPaymentIntentByInvoiceKey(invoiceKey);
    if (earlier?.status === 'succeeded') {
      // the money arrived but its webhook did not: record it the way the webhook would; onTopUpPaid credits and clears
      const date = toStoreDate(new Date(earlier.created * 1000));
      await settleSucceededPayment(db, { db: () => db, port: () => port, now: () => new Date(), log }, {
        kind: 'payment-succeeded', attemptKey: attemptRef.id, paymentIntentId: earlier.id, chargeId: earlier.chargeId,
        amount: earlier.amountReceived, date, currency: earlier.currency, paymentMethodId: '', customerId: '',
      });
      log('warn', 'autoTopUp: earlier charge had succeeded, recorded instead of charging again', { tenantId, invoiceKey, paymentIntentId: earlier.id });
      return 'skipped';
    }
    if (earlier && PI_IN_FLIGHT.includes(earlier.status)) {
      log('warn', 'autoTopUp: earlier charge still in flight, not charging again', { tenantId, invoiceKey, paymentIntentId: earlier.id, status: earlier.status });
      return 'skipped';
    }
    retryCount += 1;
    idempotencyKey = `${invoiceKey}-r${retryCount}`;
  }

  // Pending before the charge: a fast webhook may credit (and clear) the top-up before chargeOffSession returns.
  await autoTopUpRequestRef(db, tenantId).set({ requestedAt: request.requestedAt, pendingInvoiceKey: invoiceKey, retryCount });

  const now = toStoreDateTime(new Date());
  if (!existing) {
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId: tenantId, accountingTenantId, purpose: 'topup', invoiceKey, amount, offSession: true,
      createdBy: 'system', state: 'open', createdAt: now, updatedAt: now,
    });
  } else {
    // a re-charge: the attempt follows the new PaymentIntent
    await attemptRef.update({ state: 'open', error: '', stripePaymentIntentId: '', stripeChargeId: '', updatedAt: now });
  }

  return {
    attemptKey: attemptRef.id,
    invoiceKey,
    charge: {
      customerId, paymentMethodId: method.stripePaymentMethodId, amount,
      description: `Guthaben-Aufladung, Rechnung ${invoiceNo}`,
      metadata: { attemptKey: attemptRef.id, tenantId, accountingTenantId, purpose: 'topup', invoiceKey },
      idempotencyKey,
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
