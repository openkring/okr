import { openAmount, type InvoiceLike } from '../invoice/invoice-payment.logic';

/** The cap of the tenant's invoice list. */
export const MY_INVOICES_CAP = 120;
/** States of an invoice that is not (yet) issued: never shown to the receiver. */
const UNISSUED_STATES: readonly string[] = ['draft', 'created', 'issuing'];

export interface MyBillingInvoice {
  invoiceKey: string; invoiceNo: number; invoiceDate: string; dueDate: string; totalAmount: number;
  openAmount: number; state: string; billingKind: string; title: string;
}

/** Whether the stored invoice is one the tenant may see: issued, not archived, in the operator books, addressed to the tenant. */
export function isTenantInvoice(inv: Record<string, unknown> | undefined, books: string, tenantId: string): boolean {
  if (!inv) return false;
  if (inv['accountingTenantId'] !== books) return false;
  if ((inv['receiver'] as { key?: string } | undefined)?.key !== tenantId) return false;
  if (inv['isArchived'] === true) return false;
  return !UNISSUED_STATES.includes(String(inv['state'] ?? ''));
}

/** Newest first, capped; amounts in Rappen, the open amount including reminder fees. */
export function myInvoiceViews(docs: { id: string; data: Record<string, unknown> }[], books: string, tenantId: string): MyBillingInvoice[] {
  return docs
    .filter(d => isTenantInvoice(d.data, books, tenantId))
    .map(d => ({
      invoiceKey: d.id,
      invoiceNo: Number(d.data['invoiceNo'] ?? 0),
      invoiceDate: String(d.data['invoiceDate'] ?? ''),
      dueDate: String(d.data['dueDate'] ?? ''),
      totalAmount: (d.data['totalAmount'] as { amount?: number } | undefined)?.amount ?? 0,
      openAmount: openAmount(d.data as unknown as InvoiceLike),
      state: String(d.data['state'] ?? ''),
      billingKind: String(d.data['billingKind'] ?? ''),
      title: String(d.data['title'] ?? ''),
    }))
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : b.invoiceNo - a.invoiceNo))
    .slice(0, MY_INVOICES_CAP);
}
