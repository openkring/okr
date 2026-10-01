import { BankImportRowModel, InvoiceModel } from '@okr/shared-models';
import { findQrReference, getFullName, normalizeQrReference } from '@okr/shared-util-core';

/**
 * Links incoming bank credits to the invoices they pay, by QR reference (spec 1.2 §4.2).
 * The reference comes from camt (`paymentReference`) or is found in the bank text (CSV).
 * Only sets `invoiceKey`, `paymentReference` and — when no rule set one — the title; the
 * counter-account stays with the bank rules / the treasurer.
 * Legacy Firestore rows may lack `paymentReference`/`invoiceKey` (undefined); both are tolerated.
 */
export function matchInvoicePayments(
  rows: BankImportRowModel[],
  invoices: InvoiceModel[],
  titlePrefix: string,
): { rows: BankImportRowModel[]; matched: number } {
  const byRef = new Map<string, InvoiceModel>();
  for (const inv of invoices) {
    const ref = normalizeQrReference(inv.paymentReference);
    if (ref && inv.state !== 'paid' && inv.state !== 'cancelled') byRef.set(`${inv.accountingTenantId}|${ref}`, inv);
  }
  let matched = 0;
  const out = rows.map(r => {
    if (r.status === 'posted' || r.invoiceKey || (r.amount?.amount ?? 0) <= 0) return r;
    const ref = normalizeQrReference(r.paymentReference) || findQrReference(r.rawText);
    const inv = ref ? byRef.get(`${r.accountingTenantId}|${ref}`) : undefined;
    if (!inv?.okey) return r;
    matched += 1;
    const receiver = inv.receiver ? (inv.receiver.label || getFullName(inv.receiver.name1, inv.receiver.name2)) : '';
    return {
      ...r,
      invoiceKey: inv.okey,
      paymentReference: ref,
      title: r.title || `${titlePrefix} ${inv.invoiceId} ${receiver}`.trim(),
    };
  });
  return { rows: out, matched };
}
