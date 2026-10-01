import { BankImportRowModel, BankImportSplit, MoneyModel } from '@okr/shared-models';

import { ParsedStatement } from './types';

export interface ImportContext {
  tenantId: string;
  accountingTenantId: string;
  bankProfileKey: string;
  sourceFileName: string;
  importedBy: string;
  importedAt: string;   // StoreDateTime
}

/** Parsed rows + their import keys → staging documents (okey == importKey), all `unmapped`. */
export function toImportRows(s: ParsedStatement, keys: string[], ctx: ImportContext): BankImportRowModel[] {
  if (keys.length !== s.rows.length) throw new Error(`toImportRows: ${keys.length} keys for ${s.rows.length} rows`);
  return s.rows.map((r, i) => {
    const row = new BankImportRowModel(ctx.tenantId, ctx.accountingTenantId);
    row.okey = keys[i];
    row.importKey = keys[i];
    row.bankProfileKey = ctx.bankProfileKey;
    row.date = r.date;
    row.rawText = r.rawText;
    row.payee = r.payee;
    row.amount = new MoneyModel(r.amount, r.currency);
    row.fee = new MoneyModel(r.fee ?? 0, r.currency);
    row.amountFx = r.amountFx ? new MoneyModel(r.amountFx.amount, r.amountFx.currency) : undefined;
    row.fxRate = r.fxRate ?? 0;
    row.bankReference = r.bankReference;
    row.paymentReference = r.paymentReference ?? '';
    row.saldo = r.saldo !== undefined ? new MoneyModel(r.saldo, r.currency) : undefined;
    row.sourceFileName = ctx.sourceFileName;
    row.importedBy = ctx.importedBy;
    row.importedAt = ctx.importedAt;
    return row;
  });
}

/**
 * Give a stored row the `fee` its type already promises.
 *
 * `BankImportRowModel.fee` is non-optional, but a Firestore read is a raw plain object — the
 * class field initialisers never run — so the type only holds for documents that were WRITTEN
 * with the field. `fee` arrived with spec 1.62 (RaiseNow); the collection dates from spec 1.60,
 * so every row imported before then and still unposted reads back with `fee === undefined`.
 *
 * Normalising on read is what keeps the declared type honest for everything downstream. Without
 * it the truthful defence is an optional chain in the template, which `strictTemplates` then
 * reports as redundant (NG8107) — and following that advice turns the warning into a TypeError
 * on exactly those legacy rows.
 *
 * The fee shares the currency of `amount` (spec 1.62 §3.2), so it is taken from there.
 */
export function withFee(row: BankImportRowModel): BankImportRowModel {
  if (row.fee) return row;
  return { ...row, fee: new MoneyModel(0, row.amount?.currency ?? 'CHF') };
}

/** Same read-side repair as `withFee`: rows written before split assignments have no `splits`. */
export function withSplits(row: BankImportRowModel): BankImportRowModel {
  if (Array.isArray(row.splits)) return row;
  return { ...row, splits: [] };
}

export function emptyBankImportSplit(): BankImportSplit {
  return { title: '', accountKey: '', vatCodeKey: '', amount: 0 };
}

/**
 * What is left for the main part (title/accountKey/vatCodeKey) of a split assignment, as a magnitude
 * in minor units: the gross amount minus every further part. The counter side is always gross — a
 * processor fee is taken from the bank side (spec 1.62 §5), so it does not reduce what can be split.
 */
export function mainPartAmount(row: BankImportRowModel): number {
  const parts = (row.splits ?? []).reduce((sum, s) => sum + (s.amount || 0), 0);
  return Math.abs(row.amount?.amount ?? 0) - parts;
}
