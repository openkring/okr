// apps/functions/src/ledger/index.ts
//
// `ledger` — the callable for ledger reads that are too big for a client (spec 1.177 §6.2). One op today:
//  - refreshLedgerBalances { accountingTenantId, full? } → RefreshResult
// A `makeOpRouter` function, so that later ledger ops need no further function slot in europe-west6.
// The weekly full check lives in ledger-books.ts (a job of nightlyMaintenance), so the scheduler does not load this router.

import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { AccountingConfigCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, tenantIdOfUserData } from '@okr/shared-util-functions';

import { makeOpRouter, type OpHandler } from '../_router';
import { booksOf } from './ledger-books';
import { refreshLedgerBalances, RefreshResult } from './refresh-ledger-balances';

const CF_NAME = 'ledger';
/** The roles that read the ledger (firestore.rules `isLedgerReader`), read from users/{uid} — role claims are never minted. */
const LEDGER_READER_ROLES = ['treasurer', 'admin', 'privileged', 'auditor'];
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;

interface RefreshRequest { accountingTenantId?: unknown; full?: unknown }

export function isLedgerReader(roles: Record<string, unknown> | undefined): boolean {
  return LEDGER_READER_ROLES.some(r => roles?.[r] === true);
}

async function refreshForCaller(request: CallableRequest<RefreshRequest>): Promise<RefreshResult> {
  checkAppCheckToken(request as never, CF_NAME);
  checkAuthentication(request as never, CF_NAME);
  const db = getFirestore();
  const user = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data();
  const tenantId = tenantIdOfUserData(user);
  if (!tenantId) throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
  if (!isLedgerReader(user?.['roles'] as Record<string, unknown> | undefined)) throw new HttpsError('permission-denied', 'not a ledger reader');

  // The books are named by the caller, never derived from the app tenant: tenant 'scs' keeps the books 'scs' AND 'gss'.
  const accountingTenantId = typeof request.data?.accountingTenantId === 'string' ? request.data.accountingTenantId.trim() : '';
  if (!accountingTenantId || !DOC_ID.test(accountingTenantId)) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
  const config = (await db.collection(AccountingConfigCollection).doc(accountingTenantId).get()).data();
  if (!config || !((config['tenants'] as unknown[] | undefined) ?? []).includes(tenantId)) throw new HttpsError('not-found', 'unknown books');

  const { books, alwaysFull } = booksOf(accountingTenantId, config);
  return refreshLedgerBalances(db, books, { full: alwaysFull || request.data?.full === true });
}

export const LEDGER_OPS: Record<string, OpHandler> = {
  refreshLedgerBalances: refreshForCaller as OpHandler,
};

export const LEDGER_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  memory: '512MiB' as const,
  timeoutSeconds: 120,
};

export const ledger = makeOpRouter(CF_NAME, LEDGER_OPTIONS, LEDGER_OPS);
