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
