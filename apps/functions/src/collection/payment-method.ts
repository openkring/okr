import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { publicAppOrigin } from '@okr/shared-util-core';
import { SubscriptionCollection, SubscriptionModel } from '@okr/shared-models';

import { stripePort, stripeSecretKey } from './stripe-port';

const REGION = 'europe-west6';

/** Reads the subscription doc, creating it with the model defaults (billing 'exempt') when missing. */
async function ensureSubscription(db: Firestore, tenantId: string): Promise<Record<string, unknown>> {
  const ref = db.collection(SubscriptionCollection).doc(tenantId);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as Record<string, unknown>;
  const { okey: _okey, ...fresh } = new SubscriptionModel(tenantId);
  await ref.set(fresh);
  return fresh as unknown as Record<string, unknown>;
}

export async function appOriginOf(db: Firestore, tenantId: string): Promise<string> {
  const cfg = (await db.collection('app-config').doc(tenantId).get()).data();
  return publicAppOrigin(cfg?.['appDomain'] as string | undefined, tenantId);
}

/** The tenant's Stripe customer: created on first use, name from orgs/{tenantId}, email from billingEmail or the caller. */
export async function ensureStripeCustomer(
  db: Firestore, request: CallableRequest, tenantId: string, sub: Record<string, unknown>,
): Promise<string> {
  const org = (await db.collection('orgs').doc(tenantId).get()).data();
  const name = String(org?.['name'] ?? tenantId);
  let email = String(sub['billingEmail'] ?? '');
  if (!email) email = (request.auth?.token?.['email'] as string | undefined) ?? (await getAuth().getUser(request.auth?.uid ?? '')).email ?? '';
  const existingId = String(sub['stripeCustomerId'] ?? '');
  const customerId = await stripePort().ensureCustomer({ tenantId, name, email, existingId });
  if (customerId !== existingId) await db.collection(SubscriptionCollection).doc(tenantId).update({ stripeCustomerId: customerId });
  return customerId;
}

/** Hosted Stripe Checkout (setup mode) to save a card or PayPal. Caller: admin of their own tenant. */
export const createPaymentMethodSession = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: [stripeSecretKey] },
  async (request: CallableRequest): Promise<{ url: string }> => {
    const CF_NAME = 'createPaymentMethodSession';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, []); // admin only
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const db = getFirestore();

    const sub = await ensureSubscription(db, tenantId);
    const customerId = await ensureStripeCustomer(db, request, tenantId, sub);
    const origin = await appOriginOf(db, tenantId);
    const { url } = await stripePort().createSetupSession({
      customerId, tenantId, successUrl: `${origin}/billing?stripe=done`, cancelUrl: `${origin}/billing?stripe=cancel`,
    });
    logger.info(`${CF_NAME}: setup session for tenant ${tenantId}`);
    return { url };
  },
);

/** Detaches the saved payment method at Stripe and clears it (and autopay) on the subscription. */
export const removePaymentMethod = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, secrets: [stripeSecretKey] },
  async (request: CallableRequest): Promise<{ ok: true }> => {
    const CF_NAME = 'removePaymentMethod';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, []); // admin only
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const db = getFirestore();

    const ref = db.collection(SubscriptionCollection).doc(tenantId);
    const sub = (await ref.get()).data();
    const pmId = String((sub?.['paymentMethod'] as { stripePaymentMethodId?: string } | null | undefined)?.stripePaymentMethodId ?? '');
    if (!pmId) throw new HttpsError('failed-precondition', 'No saved payment method.');
    await stripePort().detachPaymentMethod(pmId);
    await ref.update({ paymentMethod: null, autopay: false });
    logger.info(`${CF_NAME}: removed payment method of tenant ${tenantId}`);
    return { ok: true };
  },
);
