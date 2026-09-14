import { BankImportRowModel, MoneyModel } from '@okr/shared-models';

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
    row.amountFx = r.amountFx ? new MoneyModel(r.amountFx.amount, r.amountFx.currency) : undefined;
    row.fxRate = r.fxRate ?? 0;
    row.bankReference = r.bankReference;
    row.saldo = r.saldo !== undefined ? new MoneyModel(r.saldo, r.currency) : undefined;
    row.sourceFileName = ctx.sourceFileName;
    row.importedBy = ctx.importedBy;
    row.importedAt = ctx.importedAt;
    return row;
  });
}
