// apps/functions/src/ledger/ledger-books.ts
//
// The books of a ledger-balance refresh, and the weekly full check (spec 1.177 §6.2). Kept apart from the `ledger`
// router so that nightlyMaintenance and migrateCostCenters can import it without loading the callable.

import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { AccountingConfigCollection, LedgerBalanceCollection } from '@okr/shared-models';

import { refreshLedgerBalances, RefreshBooks } from './refresh-ledger-balances';

/**
 * The books of a config, scoped like the clients' queries. bexio books are always rebuilt in full: their sync writes
 * locked years without knowing about locks.
 */
export function booksOf(accountingTenantId: string, config: Record<string, unknown>): { books: RefreshBooks; alwaysFull: boolean } {
  const tenants = (Array.isArray(config['tenants']) ? config['tenants'] : []).filter((t): t is string => typeof t === 'string' && !!t);
  const backend = typeof config['accountingBackend'] === 'string' && config['accountingBackend'] ? config['accountingBackend'] : 'native';
  return {
    books: { accountingTenantId, tenants, fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1 },
    alwaysFull: backend !== 'native',
  };
}

/** Sunday in Zurich: the day of the weekly full check. */
export function isSundayInZurich(now: Date): boolean {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short' }).format(now) === 'Sun';
}

/**
 * Weekly (nightlyMaintenance, Sundays): a full rebuild of every set of books that has balances. A locked year that
 * differs from its document is logged as an error by the refresh — a change in closed books.
 */
export async function runLedgerBalanceWeekly(now = new Date(), db: Firestore = getFirestore()): Promise<void> {
  const ids = new Set((await db.collection(LedgerBalanceCollection).select('accountingTenantId').get()).docs
    .map(d => d.data()['accountingTenantId']).filter((id): id is string => typeof id === 'string' && !!id));
  for (const id of ids) {
    const config = (await db.collection(AccountingConfigCollection).doc(id).get()).data();
    if (!config) { logger.warn(`ledgerBalanceWeekly: ${id} has balances but no accounting-config`); continue; }
    try {
      const result = await refreshLedgerBalances(db, booksOf(id, config).books, { full: true, now });
      if (!result.countsMatch || result.changedLockedYears.length) {
        logger.error(`ledgerBalanceWeekly: ${id} countsMatch=${result.countsMatch} changedLockedYears=${result.changedLockedYears.join(',')}`);
      }
    } catch (err) {
      logger.error(`ledgerBalanceWeekly: ${id} failed`, err);
    }
  }
}
