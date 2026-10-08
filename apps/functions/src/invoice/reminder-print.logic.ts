/** Pure rules of the reminder print PDF (spec 1.90 §5.4). pdf-lib is pure JS, so the merge is testable here. */
import { PDFDocument } from 'pdf-lib';

export const MAX_PRINT_ITEMS = 50;

export interface PrintItem { invoiceKey: string; documentKey: string; attachInvoice: boolean }

export function printItemsRefusal(items: unknown): 'bad-items' | 'too-many' | undefined {
  if (!Array.isArray(items) || items.length === 0) return 'bad-items';
  if (items.length > MAX_PRINT_ITEMS) return 'too-many';
  const ok = items.every((i: Partial<PrintItem> | null) =>
    !!i && typeof i.invoiceKey === 'string' && !!i.invoiceKey.trim() && typeof i.documentKey === 'string' && !!i.documentKey.trim()
    && (i.attachInvoice === undefined || typeof i.attachInvoice === 'boolean'));
  return ok ? undefined : 'bad-items';
}

/** Why one item cannot be printed: unknown/foreign invoice, a document that is not one of its reminders, a missing invoice PDF to attach. */
export function printItemRefusal(invoice: Record<string, unknown> | undefined, tenantId: string, documentKey: string, attachInvoice: boolean):
  'not-found' | 'foreign-document' | 'no-document' | undefined {
  if (!invoice || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return 'not-found';
  const reminders = (invoice['reminders'] as { documentKey?: string }[] | undefined) ?? [];
  if (!reminders.some((r) => r.documentKey === documentKey)) return 'foreign-document';
  if (attachInvoice && !invoice['documentKey']) return 'no-document';
  return undefined;
}

export function printFilename(invoiceIds: string[], today: string): string {
  return invoiceIds.length === 1 ? `Mahnung-${invoiceIds[0]}.pdf` : `Mahnlauf-${today}.pdf`;
}

/** All pages of all parts, in order, in one PDF. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}
