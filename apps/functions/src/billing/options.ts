/** Paid options on the subscription (plan 2 Task 7) and the billing e-mail (Task 12). */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { SubscriptionCollection } from '@okr/shared-models';
import { FEATURE_BLOCKS, type FeatureBlock } from '@okr/tenant-util';

import { assertCallerIsAdmin, ensureSubscription } from '../collection/payment-method';
import { applySelection } from '../tenant/apply-feature-selection';
import { isPaidOptionId } from './paid-options.logic';

export { paidOptionChanges } from './paid-options.logic';

const REGION = 'europe-west6';
// Same pattern the application and e-sign forms use (no shared validator exists).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin of the caller's own tenant: replace the paid options, then switch the matching blocks on/off. */
export const createSetSubscriptionOptions = (catalogue: FeatureBlock[]) => onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<{ options: string[] }> => {
    const CF_NAME = 'setSubscriptionOptions';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const raw = request.data?.options as unknown;
    if (!Array.isArray(raw) || raw.some(o => typeof o !== 'string')) {
      throw new HttpsError('invalid-argument', `${CF_NAME}: options must be a list of option ids.`);
    }
    const options = [...new Set(raw as string[])];
    const unknown = options.filter(id => !isPaidOptionId(id));
    if (unknown.length > 0) {
      throw new HttpsError('invalid-argument', `${CF_NAME}: unknown option(s) ${unknown.join(', ')}.`, { ids: unknown });
    }

    const sub = await ensureSubscription(db, tenantId);
    if (sub['billing'] !== 'stripe') {
      throw new HttpsError('failed-precondition', 'not-billed-by-stripe', { reason: 'not-billed-by-stripe' });
    }
    const before = (sub['options'] as string[] | undefined) ?? [];
    const enable = options.filter(id => !before.includes(id));
    const disable = before.filter(id => !options.includes(id));

    // Selection first: a refusal (a running block still needs a disabled one) must leave the options untouched.
    await applySelection(db, catalogue, tenantId, request.auth?.uid ?? '', { enable, disable });
    await db.collection(SubscriptionCollection).doc(tenantId).set({ options }, { merge: true });
    logger.info(`${CF_NAME}: tenant ${tenantId} options ${before.join(',')} -> ${options.join(',')}`);
    return { options };
  },
);

export const setSubscriptionOptions = createSetSubscriptionOptions(FEATURE_BLOCKS);

/** Admin of the caller's own tenant: the address the billing mails and the Stripe customer use. */
export const setBillingEmail = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<{ email: string }> => {
    const CF_NAME = 'setBillingEmail';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    await assertCallerIsAdmin(db, request, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const email = typeof request.data?.email === 'string' ? request.data.email.trim() : '';
    if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', `${CF_NAME}: not a valid e-mail address.`);

    await ensureSubscription(db, tenantId);
    await db.collection(SubscriptionCollection).doc(tenantId).set({ billingEmail: email }, { merge: true });
    logger.info(`${CF_NAME}: billing e-mail set for tenant ${tenantId}`);
    return { email };
  },
);
