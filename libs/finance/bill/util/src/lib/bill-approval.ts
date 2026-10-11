import { Signal } from '@angular/core';

/** One bill as the payment_approver sees it, read-only (spec 1.94 §3.5, callable getBillsForApproval). Amounts in Rappen. */
export interface ApprovalBill {
  okey: string; billId: string; title: string; vendorName: string; billDate: string; dueDate: string;
  amount: number; currency: string; state: string; creditorIban: string; paymentReference: string;
  paymentAccountKey: string; paymentAccountName: string; paymentAccountIban: string;
  /** accountLabel / costCenterLabel = `id name` of the books' account and cost centre, '' when unknown */
  lines: { title: string; accountKey: string; costCenterKey: string; amount: number; accountLabel: string; costCenterLabel: string }[];
  vouchers: { name: string; url: string }[];
}

/**
 * date = the digest day (StoreDate), '' when a single bill was requested.
 * paymentAccountKeys = the books' paying accounts in their configured order (`billPaymentAccountKeys`); bills carry
 * one of these keys or '' — the groups follow this order, as in the daily task.
 */
export interface BillApprovalResult { accountingTenantId: string; date: string; paymentAccountKeys: string[]; bills: ApprovalBill[] }

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
 * The bills grouped by the account they are paid from, in the books' configured order `order` (the daily task's order);
 * a key missing from `order` follows in first-seen order. Heading `name · IBAN` (the key when both are unknown).
 * Bills without a paying account (`''`) come last with an empty heading — the page labels that group.
 */
export function groupApprovalBills(bills: ApprovalBill[], order: string[] = []): { heading: string; bills: ApprovalBill[] }[] {
  const groups = new Map<string, { heading: string; bills: ApprovalBill[] }>();
  const without: ApprovalBill[] = [];
  for (const bill of bills) {
    const key = bill.paymentAccountKey ?? '';
    if (!key) { without.push(bill); continue; }
    let group = groups.get(key);
    if (!group) {
      group = { heading: [bill.paymentAccountName, bill.paymentAccountIban].filter(Boolean).join(' · ') || key, bills: [] };
      groups.set(key, group);
    }
    group.bills.push(bill);
  }
  const rank = (key: string): number => { const i = order.indexOf(key); return i < 0 ? order.length : i; };
  // Array.prototype.sort is stable: unknown keys keep their first-seen order behind the configured ones
  const result = [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, g]) => g);
  if (without.length > 0) result.push({ heading: '', bills: without });
  return result;
}
