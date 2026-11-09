// apps/functions/src/credit/credit-callables.ts
//
// Callables of the prepaid credit (plan 1.149 Task 9): the quote a sender shows before sending, a top-up invoice
// an admin pays now (card / TWINT / PayPal on the pay page, or by QR bill), and the auto top-up settings.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, SubscriptionCollection } from '@okr/shared-models';
import type { TransactionQuote } from '@okr/business-metering-util';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { appOriginOf, assertCallerIsAdmin, ensureSubscription } from '../collection/payment-method';
import { quoteOrRefuse } from './credit-api';
import { topUpAmountRefusal } from './auto-topup.logic';
import { issueTopUpInvoice } from './topup.core';

const REGION = 'europe-west6';

/**
 * Who may see the quote and the balance: the roles that send mailings (privileged, contentAdmin — as for the
 * e-mail preview) and the treasurer; admin always passes checkRoles. Members without these roles do not send.
 */
export const QUOTE_ROLES = ['privileged', 'contentAdmin', 'treasurer'];

/** Price of a send and whether the tenant's credit covers it. */
export const quoteCredit = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ product?: unknown; units?: unknown; pages?: unknown }>): Promise<TransactionQuote & { balance: number; sufficient: boolean }> => {
    const CF_NAME = 'quoteCredit';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, QUOTE_ROLES);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const quote = quoteOrRefuse(request.data?.product, request.data?.units, request.data?.pages);
    const account = (await getFirestore().collection(CreditAccountCollection).doc(tenantId).get()).data();
    const balance = Number(account?.['balance'] ?? 0);
    return { ...quote, balance, sufficient: balance >= quote.total };
  },
);

/** A top-up invoice of `amount` Rappen to the caller's tenant. Renders the PDF: issueInvoice's runtime options. */
export const createTopUpInvoice = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10 },
  async (request: CallableRequest<{ amount?: unknown }>): Promise<{ invoiceKey: string; payUrl: string }> => {
    const CF_NAME = 'createTopUpInvoice';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const amount = request.data?.amount;
    const refusal = topUpAmountRefusal(amount);
    if (refusal) throw new HttpsError('invalid-argument', refusal);

    const okey = `topup-${tenantId}-${db.collection('invoices').doc().id}`;
    const { invoiceKey } = await issueTopUpInvoice(db, { tenantId, amount: amount as number, okey, actor: request.auth?.uid ?? '' });
    const payUrl = `${await appOriginOf(db, tenantId)}/pay/${invoiceKey}`;
    logger.info(`${CF_NAME}: top-up invoice ${invoiceKey} for tenant ${tenantId} (${String(amount)} Rappen)`);
    return { invoiceKey, payUrl };
  },
);

/** Auto top-up: when a send takes the credit below `threshold`, `amount` is charged to the saved payment method. */
export const setAutoTopUp = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ enabled?: unknown; threshold?: unknown; amount?: unknown }>): Promise<{ ok: true }> => {
    const CF_NAME = 'setAutoTopUp';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const { enabled, threshold, amount } = request.data ?? {};
    if (typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled must be true or false');
    if (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 0) {
      throw new HttpsError('invalid-argument', 'threshold must be a whole number of Rappen, 0 or more');
    }
    // Switched off, the amount may stay empty (0); switched on, it is a valid top-up.
    const refusal = enabled || amount !== 0 ? topUpAmountRefusal(amount) : '';
    if (refusal) throw new HttpsError('invalid-argument', refusal);

    const sub = await ensureSubscription(db, tenantId);
    if (enabled && !(sub['paymentMethod'] as { stripePaymentMethodId?: string } | null | undefined)?.stripePaymentMethodId) {
      throw new HttpsError('failed-precondition', 'Auto top-up needs a saved payment method.', { reason: 'no-payment-method' });
    }
    await db.collection(SubscriptionCollection).doc(tenantId).update({ autoTopUp: { enabled, threshold, amount: amount as number } });
    logger.info(`${CF_NAME}: tenant ${tenantId} auto top-up ${enabled ? 'on' : 'off'} (threshold ${threshold}, amount ${String(amount)})`);
    return { ok: true };
  },
);
