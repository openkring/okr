/** Paid options on the subscription (plan 2 Task 7) and the billing e-mail (Task 12). */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { ADD_ON_BLOCKS, optionBlocks } from '@okr/business-metering-util';
import { SubscriptionCollection } from '@okr/shared-models';
import { FEATURE_BLOCKS, resolveWithDeps, type FeatureBlock } from '@okr/tenant-util';

import { assertCallerIsAdmin, ensureSubscription } from '../collection/payment-method';
import { applySelection } from '../tenant/apply-feature-selection';
import { isPaidOptionId, paidOptionChanges } from './paid-options.logic';

export { paidOptionChanges } from './paid-options.logic';

const REGION = 'europe-west6';
// Same pattern the application and e-sign forms use (no shared validator exists).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin of the caller's own tenant: replace the paid options, then switch the matching blocks on/off. */
export const createSetSubscriptionOptions = (
  catalogue: FeatureBlock[], blockMap: Record<string, readonly string[]> = ADD_ON_BLOCKS,
) => onCall(
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
    // an ended subscription books nothing: reactivating it is the operator's call (setTenantState)
    const state = String(sub['state'] ?? 'active');
    if (state === 'closed' || state === 'cancelled') {
      throw new HttpsError('failed-precondition', 'subscription-not-active', { reason: 'subscription-not-active', state });
    }
    const unavailable = options.filter(id => optionBlocks(id, blockMap).length === 0);
    if (unavailable.length > 0) {
      throw new HttpsError('failed-precondition', 'option-not-available', { reason: 'option-not-available', ids: unavailable });
    }
    const before = (sub['options'] as string[] | undefined) ?? [];
    const blocksOf = (ids: string[]) => ids.flatMap(id => optionBlocks(id, blockMap));
    // A requested option whose dependency closure holds ANOTHER paid option's block (expense -> finance)
    // would run that block unbilled: the implied option must be booked too.
    const requires = paidOptionChanges([], resolveWithDeps(catalogue, blocksOf(options)), options, blockMap);
    if (requires.length > 0) {
      throw new HttpsError('failed-precondition', 'option-requires', { reason: 'option-requires', ids: requires });
    }
    const stillOwned = new Set(blocksOf(options));
    // every requested option, not just the new ones: enabling is idempotent, and a retry after a failed enable converges
    const enable = blocksOf(options);
    const disable = blocksOf(before.filter(id => !options.includes(id))).filter(b => !stillOwned.has(b));
    const actor = request.auth?.uid ?? '';

    // Order: disables (a refusal throws before any write), then the options, then the enables — features
    // never run ahead of billing, and a retry of the same input converges.
    await applySelection(db, catalogue, tenantId, actor, { enable: [], disable });
    await db.collection(SubscriptionCollection).doc(tenantId).set({ options }, { merge: true });
    const { withheld } = await applySelection(db, catalogue, tenantId, actor, { enable, disable: [] });
    // rollout withheld a block (or a block it needs): the tenant does not get it, so it must not be billed
    const held = new Set(withheld);
    const notGranted = options.filter(id => resolveWithDeps(catalogue, optionBlocks(id, blockMap)).some(b => held.has(b)));
    if (notGranted.length > 0) {
      await db.collection(SubscriptionCollection).doc(tenantId).set({ options: FieldValue.arrayRemove(...notGranted) }, { merge: true });
      logger.warn(`${CF_NAME}: tenant ${tenantId} option(s) ${notGranted.join(',')} withheld by rollout, removed again`);
      throw new HttpsError('failed-precondition', 'option-not-available', { reason: 'option-not-available', ids: notGranted });
    }
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
