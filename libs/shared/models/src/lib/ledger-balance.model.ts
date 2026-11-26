import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';

/**
 * One cell of a ledger balance (spec 1.177 §6.1): the posted lines of one calendar month on one account,
 * Kostenstelle and project, summed. Short field names keep a year below 20 KB.
 */
export interface LedgerBalanceCell {
  m: number;   // calendar month 1–12; 0 in the undated document
  a: string;   // accountKey
  c: string;   // costCenterKey, '' = ohne Kostenstelle
  p: string;   // projectKey, '' = ohne Projekt
  d: number;   // Σ debit, minor units
  k: number;   // Σ credit, minor units
}

/** Version of the cell format. A document with another value is recomputed. */
export const LEDGER_BALANCE_VERSION = 1;

/**
 * The balances of one set of books in one calendar year (spec 1.177), recomputed from the ledger by the
 * Cloud Function `ledger` (op `refreshLedgerBalances`), never incremented and never written by a client.
 * okey `{accountingTenantId}-{yyyy}`; undated bookings go to `{accountingTenantId}-0000`.
 */
export class LedgerBalanceModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public accountingTenantId = '';     // the books — never taken from tenants
  public year = 0;                    // calendar year; 0 = undated bookings
  public cells: LedgerBalanceCell[] = [];   // posted bookings only
  public bookingCounts: number[] = [];      // bookings per month (index 0 = January), every status
  public bookingCount = 0;                  // all bookings of the year, every status
  public lineCount = 0;                     // all lines of those bookings
  public locks = '';                        // fingerprint of the locked annual periods covering the year, '' = open
  public computedAt = '';                   // StoreDateTime of the ledger snapshot
  public version = LEDGER_BALANCE_VERSION;

  constructor(tenants: string[], accountingTenantId: string, year: number) {
    this.tenants = tenants;
    this.accountingTenantId = accountingTenantId;
    this.year = year;
    this.okey = ledgerBalanceKey(accountingTenantId, year);
  }
}

export function ledgerBalanceKey(accountingTenantId: string, year: number): string {
  return `${accountingTenantId}-${String(year).padStart(4, '0')}`;
}

export const LedgerBalanceCollection = 'ledger-balances';
export const LedgerBalanceModelName = 'ledgerBalance';
