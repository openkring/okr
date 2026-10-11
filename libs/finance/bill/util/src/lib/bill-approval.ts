import { Signal } from '@angular/core';

/** One bill as the payment_approver sees it, read-only (spec 1.94 §3.5, callable getBillsForApproval). Amounts in Rappen. */
export interface ApprovalBill {
  okey: string; billId: string; title: string; vendorName: string; billDate: string; dueDate: string;
  amount: number; currency: string; state: string; creditorIban: string; paymentReference: string;
  paymentAccountKey: string; paymentAccountName: string; paymentAccountIban: string;
  lines: { title: string; accountKey: string; costCenterKey: string; amount: number }[];
  vouchers: { name: string; url: string }[];
}

/** date = the digest day (StoreDate), '' when a single bill was requested. */
export interface BillApprovalResult { accountingTenantId: string; date: string; bills: ApprovalBill[] }

const PFX = '@finance/bill/feature.';

/** i18n of the read-only approval pages `/bill-approval/...` (spec 1.94 §3.5). */
export const BILL_APPROVAL_I18N_KEYS = {
  approval_title:     PFX + 'approval.title',
  /** single-brace `{date}`, filled with `fill()` (store-resolved keys lose double-brace params) */
  approval_dayTitle:  PFX + 'approval.dayTitle',
  approval_noAccount: PFX + 'approval.noAccount',
  approval_empty:     PFX + 'approval.empty',
  approval_error:     PFX + 'approval.error',
  approval_vouchers:  PFX + 'approval.vouchers',
  approval_iban:      PFX + 'approval.iban',
  approval_reference: PFX + 'approval.reference',
  approval_lines:     PFX + 'approval.lines',
  approval_payFrom:   PFX + 'approval.payFrom',
  bill_date:          PFX + 'date.bill.label',
  due_date:           PFX + 'date.due.label',
} satisfies Record<string, string>;

export type BillApprovalI18n = { [K in keyof typeof BILL_APPROVAL_I18N_KEYS]: Signal<string> };

/**
 * The bills grouped by the account they are paid from, in first-seen order; heading `name · IBAN`.
 * Bills without a paying account (`''`) come last with an empty heading — the page labels that group.
 */
export function groupApprovalBills(bills: ApprovalBill[]): { heading: string; bills: ApprovalBill[] }[] {
  const groups = new Map<string, { heading: string; bills: ApprovalBill[] }>();
  const without: ApprovalBill[] = [];
  for (const bill of bills) {
    const key = bill.paymentAccountKey ?? '';
    if (!key) { without.push(bill); continue; }
    let group = groups.get(key);
    if (!group) {
      group = { heading: [bill.paymentAccountName, bill.paymentAccountIban].filter(Boolean).join(' · '), bills: [] };
      groups.set(key, group);
    }
    group.bills.push(bill);
  }
  const result = [...groups.values()];
  if (without.length > 0) result.push({ heading: '', bills: without });
  return result;
}
