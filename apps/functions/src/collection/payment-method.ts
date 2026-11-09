import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { publicAppOrigin } from '@okr/shared-util-core';
import { SubscriptionCollection, SubscriptionModel } from '@okr/shared-models';

import { stripeCustomerEmail } from './collection-access.logic';
import { stripePort, stripeSecretKey } from './stripe-port';

const REGION = 'europe-west6';

/** Reads the subscription doc, creating it with the model defaults (billing 'exempt') when missing. */
export async function ensureSubscription(db: Firestore, tenantId: string): Promise<Record<string, unknown>> {
  const ref = db.collection(SubscriptionCollection).doc(tenantId);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as Record<string, unknown>;
  const { okey: _okey, ...fresh } = new SubscriptionModel(tenantId);
  await ref.set(fresh);
  return fresh as unknown as Record<string, unknown>;
}

/** The one admin check of both billing files: users/{uid}.roles.admin (role claims are never minted) or the legacy token claim. */
export async function callerIsAdmin(db: Firestore, request: CallableRequest): Promise<boolean> {
  if (request.auth?.token?.['admin'] === true) return true;
  const roles = ((await db.collection('users').doc(request.auth?.uid ?? '').get()).data()?.['roles'] ?? {}) as Record<string, boolean>;
  return roles['admin'] === true;
}

export async function assertCallerIsAdmin(db: Firestore, request: CallableRequest, cfName: string): Promise<void> {
  if (!(await callerIsAdmin(db, request))) {
    logger.error(`${cfName}: user ${request.auth?.uid} must be an admin`);
    throw new HttpsError('permission-denied', 'This operation requires the admin role.');
  }
}

export async function appOriginOf(db: Firestore, tenantId: string): Promise<string> {
  const cfg = (await db.collection('app-config').doc(tenantId).get()).data();
  return publicAppOrigin(cfg?.['appDomain'] as string | undefined, tenantId);
}

/**
 * The tenant's Stripe customer: created on first use, name from orgs/{tenantId}. Its e-mail comes from
 * stripeCustomerEmail: billingEmail, or the caller's own address only when creating it and only for an admin of
 * that tenant (`callerIsReceiverAdmin`); an existing customer's e-mail is never replaced by the caller's.
 */
export async function ensureStripeCustomer(
  db: Firestore, request: CallableRequest, tenantId: string, sub: Record<string, unknown>, callerIsReceiverAdmin: boolean,
): Promise<string> {
  const org = (await db.collection('orgs').doc(tenantId).get()).data();
  const name = String(org?.['name'] ?? tenantId);
  const existingId = String(sub['stripeCustomerId'] ?? '');
  const email = await stripeCustomerEmail({
    existingId, billingEmail: String(sub['billingEmail'] ?? ''), callerIsReceiverAdmin,
    callerEmail: async () => (request.auth?.token?.['email'] as string | undefined) ?? (await getAuth().getUser(request.auth?.uid ?? '')).email ?? '',
  });
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
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const sub = await ensureSubscription(db, tenantId);
    const customerId = await ensureStripeCustomer(db, request, tenantId, sub, true); // the caller is an admin of tenantId
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
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

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
