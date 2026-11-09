import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { PaymentAttemptCollection, PaymentAttemptModel } from '@okr/shared-models';

import { asInvoiceLike } from '../invoice/invoice-payment.core';
import { openAmount } from '../invoice/invoice-payment.logic';
import { canPayInvoice, pickReusableAttempt } from './collection-access.logic';
import { appOriginOf, callerIsAdmin, ensureStripeCustomer, ensureSubscription } from './payment-method';
import { platformBilling } from './platform';
import { stripePort, stripeSecretKey } from './stripe-port';

const REGION = 'europe-west6';
const CF_NAME = 'createInvoicePaymentSession';
const REUSE_MS = 23 * 60 * 60 * 1000;

const storeDateTimeUtc = (d: Date): string => d.toISOString().replace(/\D/g, '').slice(0, 14);

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

    // One admin check shared with payment-method.ts.
    const roles = ((await db.collection('users').doc(uid).get()).data()?.['roles'] ?? {}) as Record<string, boolean>;
    const isAdmin = await callerIsAdmin(db, request);
    const receiverKey = String((invoice['receiver'] as { key?: string } | undefined)?.key ?? '');
    const receiverIsTenant = receiverKey !== '' && (await db.collection('app-config').doc(receiverKey).get()).exists;
    const caller = {
      tenantId,
      isAdmin,
      isTreasurerOfBooks: tenantId === operatorTenantId && (isAdmin || roles['treasurer'] === true || roles['privileged'] === true),
    };
    const open = openAmount(asInvoiceLike(invoice));
    const verdict = canPayInvoice(caller, { receiverKey, receiverIsTenant, state: String(invoice['state'] ?? ''), openAmount: open });
    if (verdict === 'denied') throw new HttpsError('permission-denied', 'You may not pay this invoice.');
    if (verdict === 'receiver-not-a-tenant') {
      throw new HttpsError('failed-precondition', 'The invoice receiver is not a tenant.', { reason: 'receiver-not-a-tenant' });
    }
    if (verdict === 'not-open') throw new HttpsError('failed-precondition', 'This invoice has nothing open to pay.');

    const payerTenantId = receiverKey;
    const purpose = invoice['billingKind'] === 'topup' ? 'topup' : 'invoice';
    const nowDate = new Date();
    const now = storeDateTimeUtc(nowDate);

    // R11: a double click reuses the open session while it is younger than 23 h, but only for the same
    // creator, save choice and amount. Any other open session of this invoice and payer is closed first.
    const offerSave = caller.isAdmin && tenantId === receiverKey;
    const openAttempts = await db.collection(PaymentAttemptCollection)
      .where('invoiceKey', '==', invoiceKey).where('payerTenantId', '==', payerTenantId)
      .where('state', '==', 'open').where('expiresAt', '>', now).get();
    const { reuse, stale } = pickReusableAttempt(
      openAttempts.docs.map((d) => ({
        id: d.id,
        createdBy: String(d.data()['createdBy'] ?? ''),
        offerSave: d.data()['offerSave'] === true,
        amount: Number(d.data()['amount'] ?? 0),
        checkoutUrl: String(d.data()['checkoutUrl'] ?? ''),
        stripeCheckoutSessionId: String(d.data()['stripeCheckoutSessionId'] ?? ''),
      })),
      { uid, offerSave, amount: open },
    );
    if (reuse) return { url: reuse.checkoutUrl };
    for (const old of stale) {
      if (old.stripeCheckoutSessionId) await stripePort().expireSession(old.stripeCheckoutSessionId);
      await db.collection(PaymentAttemptCollection).doc(old.id).update({ state: 'expired', updatedAt: now });
    }

    // The attempt exists before the session so the webhook always finds it.
    const attemptRef = db.collection(PaymentAttemptCollection).doc();
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId, accountingTenantId, purpose, invoiceKey, amount: open, createdBy: uid, offerSave, state: 'open', createdAt: now, updatedAt: now,
    });

    let sessionUrl = '';
    try {
      const sub = await ensureSubscription(db, payerTenantId);
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
        offerSave,
      });
      await attemptRef.update({
        stripeCheckoutSessionId: session.id, checkoutUrl: session.url, expiresAt: storeDateTimeUtc(new Date(nowDate.getTime() + REUSE_MS)),
      });
      sessionUrl = session.url;
    } catch (err) {
      await attemptRef.update({ state: 'failed', error: err instanceof Error ? err.message : String(err), updatedAt: storeDateTimeUtc(new Date()) });
      throw err;
    }
    logger.info(`${CF_NAME}: session for invoice ${invoiceKey} (payer=${payerTenantId}, attempt=${attemptRef.id})`);
    return { url: sessionUrl };
  },
);
