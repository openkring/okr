import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { PaymentAttemptCollection, PaymentAttemptModel, SubscriptionCollection, SubscriptionModel } from '@okr/shared-models';

import { asInvoiceLike } from '../invoice/invoice-payment.core';
import { openAmount } from '../invoice/invoice-payment.logic';
import { canPayInvoice } from './collection-access.logic';
import { appOriginOf, ensureStripeCustomer } from './payment-method';
import { platformBilling } from './platform';
import { stripePort, stripeSecretKey } from './stripe-port';

const REGION = 'europe-west6';
const CF_NAME = 'createInvoicePaymentSession';

/** Fresh Stripe Checkout (card, TWINT, PayPal) for one of our invoices. Success arrives by webhook, not the redirect. */
export const createInvoicePaymentSession = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: [stripeSecretKey] },
  async (request: CallableRequest<{ invoiceKey?: string }>): Promise<{ url: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const invoiceKey = request.data?.invoiceKey;
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    const uid = request.auth?.uid ?? '';
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const db = getFirestore();

    const invoice = (await db.collection('invoices').doc(invoiceKey).get()).data();
    if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    const { operatorTenantId, accountingTenantId } = await platformBilling(db);
    if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId) throw new HttpsError('permission-denied', 'Not an invoice of the operator books.');

    // Roles come from users/{uid}.roles: role claims are never minted.
    const roles = ((await db.collection('users').doc(uid).get()).data()?.['roles'] ?? {}) as Record<string, boolean>;
    const receiverKey = String((invoice['receiver'] as { key?: string } | undefined)?.key ?? '');
    const caller = {
      tenantId,
      isAdmin: roles['admin'] === true,
      isTreasurerOfBooks: tenantId === operatorTenantId && (roles['treasurer'] === true || roles['privileged'] === true || roles['admin'] === true),
    };
    const open = openAmount(asInvoiceLike(invoice));
    const verdict = canPayInvoice(caller, { receiverKey, state: String(invoice['state'] ?? ''), openAmount: open });
    if (verdict === 'denied') throw new HttpsError('permission-denied', 'You may not pay this invoice.');
    if (verdict === 'not-open') throw new HttpsError('failed-precondition', 'This invoice has nothing open to pay.');

    // The payer is the receiver tenant; fall back to the caller's own tenant for a treasurer paying on behalf.
    const payerTenantId = receiverKey || tenantId;
    const purpose = invoice['billingKind'] === 'topup' ? 'topup' : 'invoice';
    const now = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

    // The attempt exists before the session so the webhook always finds it.
    const attemptRef = db.collection(PaymentAttemptCollection).doc();
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId, accountingTenantId, purpose, invoiceKey, amount: open, state: 'open', createdAt: now, updatedAt: now,
    });

    const subRef = db.collection(SubscriptionCollection).doc(payerTenantId);
    let sub = (await subRef.get()).data();
    if (!sub) {
      const { okey: _k, ...fresh } = new SubscriptionModel(payerTenantId);
      await subRef.set(fresh);
      sub = fresh as unknown as Record<string, unknown>;
    }
    const customerId = await ensureStripeCustomer(db, request, payerTenantId, sub);
    const origin = await appOriginOf(db, tenantId);
    const base = `${origin}/pay/${invoiceKey}`;
    const session = await stripePort().createPaymentSession({
      customerId,
      amount: open,
      description: `Rechnung ${String(invoice['invoiceNo'] ?? invoiceKey)}`,
      metadata: { attemptKey: attemptRef.id, tenantId: payerTenantId, accountingTenantId, purpose, invoiceKey },
      successUrl: `${base}?stripe=done`,
      cancelUrl: `${base}?stripe=cancel`,
      offerSave: caller.isAdmin && tenantId === receiverKey,
    });
    await attemptRef.update({ stripeCheckoutSessionId: session.id });
    logger.info(`${CF_NAME}: session for invoice ${invoiceKey} (payer=${payerTenantId}, attempt=${attemptRef.id})`);
    return { url: session.url };
  },
);
