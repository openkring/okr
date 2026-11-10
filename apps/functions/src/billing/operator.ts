/** Operator callables (plan 2 Task 9): the billing board of all tenants, billing mode and state switches. */
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { InvoiceCollection, PaymentAttemptCollection, CreditAccountCollection, SubscriptionCollection, type BillingMode } from '@okr/shared-models';

import { callerIsAdmin, ensureSubscription } from '../collection/payment-method';
import { platformBilling } from '../collection/platform';
import { toStoreDate } from '../srv/zurich-time';
import { buildOverview, optionsFromEnabledBlocks, type BillingOverviewRow } from './operator.logic';

const REGION = 'europe-west6';
const STATE_FLAGS = ['run-failed'] as const;

/** Server-side operator check: the caller belongs to the operator tenant and is admin or treasurer. */
async function assertOperator(db: Firestore, request: CallableRequest, cfName: string) {
  const tenantId = await getCallerTenantId(request as never, cfName);
  const books = await platformBilling(db);
  const roles = ((await db.collection('users').doc(request.auth?.uid ?? '').get()).data()?.['roles'] ?? {}) as Record<string, boolean>;
  const privileged = (await callerIsAdmin(db, request)) || roles['treasurer'] === true;
  if (tenantId !== books.operatorTenantId || !privileged) {
    logger.error(`${cfName}: user ${request.auth?.uid} of tenant ${tenantId} is not an operator admin/treasurer`);
    throw new HttpsError('permission-denied', 'This operation is reserved for the platform operator.');
  }
  return books;
}

const guard = (request: CallableRequest, cf: string) => {
  checkAppCheckToken(request as never, cf);
  checkAuthentication(request as never, cf);
};

async function assertTenant(db: Firestore, tenantId: unknown, cf: string): Promise<string> {
  if (typeof tenantId !== 'string' || tenantId === '') throw new HttpsError('invalid-argument', `${cf}: tenantId is required.`);
  if (!(await db.collection('app-config').doc(tenantId).get()).exists) throw new HttpsError('not-found', `${cf}: unknown tenant ${tenantId}.`);
  return tenantId;
}

export const getBillingOverview = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<BillingOverviewRow[]> => {
    const CF_NAME = 'getBillingOverview';
    guard(request, CF_NAME);
    const db = getFirestore();
    const books = await assertOperator(db, request, CF_NAME);

    const [configs, subs, invoices, attempts] = await Promise.all([
      db.collection('app-config').get(),
      db.collection(SubscriptionCollection).get(),
      db.collection(InvoiceCollection)
        .where('tenants', 'array-contains', books.operatorTenantId)
        .where('accountingTenantId', '==', books.accountingTenantId)
        .where('isArchived', '==', false).get(),
      db.collection(PaymentAttemptCollection).where('tenants', 'array-contains', books.operatorTenantId).get(),
    ]);
    const tenantIds = [...new Set([...configs.docs.map(d => d.id), ...subs.docs.map(d => d.id)])];
    const names: Record<string, string> = {};
    const credit: Record<string, number> = {};
    await Promise.all(tenantIds.map(async t => {
      const [org, acc] = await Promise.all([db.collection('orgs').doc(t).get(), db.collection(CreditAccountCollection).doc(t).get()]);
      names[t] = String(org.data()?.['name'] ?? '');
      credit[t] = Number(acc.data()?.['balance'] ?? 0);
    }));
    return buildOverview({
      tenantIds,
      subscriptions: Object.fromEntries(subs.docs.map(d => [d.id, d.data() as Record<string, unknown>])),
      names, credit, books: books.accountingTenantId,
      invoices: invoices.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> })),
      attempts: attempts.docs.map(d => d.data() as Record<string, unknown>),
    });
  },
);

export const setTenantBilling = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<{ ok: true; addedOptions: string[] }> => {
    const CF_NAME = 'setTenantBilling';
    guard(request, CF_NAME);
    const db = getFirestore();
    await assertOperator(db, request, CF_NAME);
    const tenantId = await assertTenant(db, request.data?.tenantId, CF_NAME);
    const billing = request.data?.billing as BillingMode;
    if (billing !== 'stripe' && billing !== 'exempt') throw new HttpsError('invalid-argument', `${CF_NAME}: billing must be stripe or exempt.`);
    const sub = await ensureSubscription(db, tenantId);
    const ref = db.collection(SubscriptionCollection).doc(tenantId);
    if (billing === 'exempt') {
      await ref.set({ billing }, { merge: true });
      return { ok: true, addedOptions: [] };
    }
    const given = request.data?.billingStart;
    if (given !== undefined && !(typeof given === 'string' && /^\d{8}$/.test(given))) {
      throw new HttpsError('invalid-argument', `${CF_NAME}: billingStart must be a StoreDate (yyyyMMdd).`);
    }
    const billingStart = (given as string | undefined) || toStoreDate(new Date());
    const enabled = (await db.collection('app-config').doc(tenantId).get()).data()?.['enabledFeatures'] as string[] | undefined;
    const addedOptions = optionsFromEnabledBlocks(Array.isArray(enabled) ? enabled : undefined);
    if (!Array.isArray(enabled)) logger.warn(`${CF_NAME}: tenant ${tenantId} has no enabledFeatures (legacy all blocks): options ${addedOptions.join(',')}`);
    const patch: Record<string, unknown> = { billing, billingStart };
    if (addedOptions.length > 0) patch['options'] = FieldValue.arrayUnion(...addedOptions);
    await ref.set(patch, { merge: true });
    logger.info(`${CF_NAME}: tenant ${tenantId} -> stripe from ${billingStart}, options ${addedOptions.join(',')} (was ${String(sub['billing'])})`);
    return { ok: true, addedOptions };
  },
);

export const setTenantState = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest): Promise<{ ok: true }> => {
    const CF_NAME = 'setTenantState';
    guard(request, CF_NAME);
    const db = getFirestore();
    await assertOperator(db, request, CF_NAME);
    const tenantId = await assertTenant(db, request.data?.tenantId, CF_NAME);
    const state = request.data?.state;
    if (state !== 'active' && state !== 'cancelled') throw new HttpsError('invalid-argument', `${CF_NAME}: state must be active or cancelled.`);
    await ensureSubscription(db, tenantId);
    const patch: Record<string, unknown> = state === 'active'
      ? { state, pastDueSince: '', closingSince: '', billingFlags: FieldValue.arrayRemove(...STATE_FLAGS) }
      : { state, cancelledAt: toStoreDate(new Date()) };
    await db.collection(SubscriptionCollection).doc(tenantId).set(patch, { merge: true });
    logger.info(`${CF_NAME}: tenant ${tenantId} -> ${state}`);
    return { ok: true };
  },
);
