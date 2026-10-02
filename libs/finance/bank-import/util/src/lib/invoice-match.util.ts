import { BankImportRowModel, InvoiceModel } from '@okr/shared-models';
import { findQrReference, getFullName, normalizeQrReference } from '@okr/shared-util-core';

/**
 * Links incoming bank credits to the invoices they pay, by QR reference (spec 1.2 §4.2).
 * The reference comes from camt (`paymentReference`) or is found in the bank text (CSV).
 * A match sets `invoiceKey`, `paymentReference` and the title (the invoice title wins over a
 * rule's) and, when `receivablesAccountKey` is given, pre-assigns the receivables account
 * (Debitoren): the revenue was booked at issue, so a rule's revenue account would book it twice.
 * Manual assignments (no rule, account set) are the treasurer's choice and stay untouched.
 * A reference shared by several invoices of one book is ambiguous and never matched.
 * Legacy Firestore rows may lack `paymentReference`/`invoiceKey` (undefined); both are tolerated.
 */
export function matchInvoicePayments(
  rows: BankImportRowModel[],
  invoices: InvoiceModel[],
  opts: { titlePrefix: string; receivablesAccountKey: string },
): { rows: BankImportRowModel[]; matched: number } {
  const byRef = new Map<string, InvoiceModel>();
  const ambiguous = new Set<string>();
  for (const inv of invoices) {
    const ref = normalizeQrReference(inv.paymentReference);
    if (!ref || inv.state === 'paid' || inv.state === 'cancelled') continue;
    const key = `${inv.accountingTenantId}|${ref}`;
    if (byRef.has(key)) ambiguous.add(key);
    else byRef.set(key, inv);
  }
  let matched = 0;
  const out = rows.map(r => {
    if (r.status === 'posted' || r.invoiceKey || (r.amount?.amount ?? 0) <= 0) return r;
    if ((r.ruleKey ?? '') === '' && (r.accountKey ?? '') !== '') return r;
    const ref = normalizeQrReference(r.paymentReference) || findQrReference(r.rawText);
    const key = `${r.accountingTenantId}|${ref}`;
    const inv = ref && !ambiguous.has(key) ? byRef.get(key) : undefined;
    if (!inv?.okey) return r;
    matched += 1;
    const receiver = inv.receiver ? (inv.receiver.label || getFullName(inv.receiver.name1, inv.receiver.name2)) : '';
    const linked: BankImportRowModel = {
      ...r,
      invoiceKey: inv.okey,
      paymentReference: ref,
      title: `${opts.titlePrefix} ${inv.invoiceId} ${receiver}`.trim(),
    };
    if (!opts.receivablesAccountKey) return linked;
    return { ...linked, accountKey: opts.receivablesAccountKey, vatCodeKey: '', ruleKey: '', splits: [], status: 'mapped' as const };
  });
  return { rows: out, matched };
}

/** The i18n key (of BANK_IMPORT_I18N_KEYS) that explains why `postBankImport` booked a matched credit without settling its invoice. */
export type UnsettledReasonKey = 'post_unsettled_overpayment' | 'post_unsettled_not_payable' | 'post_unsettled_no_receivables_credit' | 'post_unsettled_other';

/**
 * Maps a server skip reason (comma-joined codes, see `invoiceSettlement` in the functions) to the
 * text a treasurer can act on. An already paid invoice reports `not-payable,overpayment`: it reads
 * as "paid or cancelled". Everything else (missing, other books, bexio, …) gets the general text.
 */
export function unsettledReasonKey(reason: string): UnsettledReasonKey {
  const codes = (reason ?? '').split(',');
  if (codes.includes('not-payable')) return 'post_unsettled_not_payable';
  if (codes.includes('overpayment')) return 'post_unsettled_overpayment';
  if (codes.includes('no-receivables-credit')) return 'post_unsettled_no_receivables_credit';
  return 'post_unsettled_other';
}
