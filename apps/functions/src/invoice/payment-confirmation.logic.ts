import type { AddressModel, InvoiceModel, PersonModel } from '@okr/shared-models';
import { buildPaymentConfirmationPayload } from '@okr/finance-invoice-util';

import type { PostalAddress } from './invoice.logic';

export type ConfirmationInvoice = Pick<InvoiceModel, 'invoiceId' | 'title' | 'invoiceDate' | 'totalAmount'> & {
  paymentDate?: string;
  payments?: { date?: string; amount?: number }[]; // the confirmed amount is their sum (receivedAmount); none = legacy, the total
  receiver?: { key?: string; name1?: string; name2?: string; modelType?: string };
};

/** Why a confirmation cannot be created (reason code), or undefined when it can. */
export function confirmationRefusal(state: string, receiverKey: string | undefined): 'not-paid' | 'no-receiver' | undefined {
  if (state !== 'paid') return 'not-paid';
  if (!receiverKey) return 'no-receiver';
  return undefined;
}

/** The invoice's `paymentDate`, else the date of its last payment, else ''. */
export function confirmationPayDate(invoice: { paymentDate?: string; payments?: { date?: string }[] }): string {
  if (invoice.paymentDate) return invoice.paymentDate;
  const last = invoice.payments?.[invoice.payments.length - 1];
  return last?.date ?? '';
}

/** Template payload, via the shared util; a missing address renders with empty address fields. */
export function buildConfirmationPayload(
  invoice: ConfirmationInvoice,
  payDate: string,
  address: PostalAddress | undefined,
  gender: string | undefined,
): Record<string, string> {
  const receiver = invoice.receiver ?? {};
  const party = receiver.modelType === 'person'
    ? { kind: 'person' as const, person: { firstName: receiver.name1 ?? '', lastName: receiver.name2 ?? '', gender } as unknown as PersonModel }
    : { kind: 'org' as const, org: { name: receiver.name2 || receiver.name1 || '' } as never };
  const addr = {
    streetName: address?.streetName ?? '', streetNumber: address?.streetNumber ?? '', zipCode: address?.zipCode ?? '', city: address?.city ?? '',
  } as AddressModel;
  return buildPaymentConfirmationPayload({ ...invoice, paymentDate: payDate } as InvoiceModel, party, addr);
}

/**
 * Finance-document fields, the same shape as the invoice PDF's (issue-invoice). `createdOn` is the
 * creation date of the existing document on a re-run; it is kept, only the last-update date moves.
 */
export function confirmationDocumentFields(i: {
  tenants: string[]; accountingTenantId: string; fullPath: string; filename: string; sizeBytes: number; today: string; createdOn?: string;
}): Record<string, unknown> {
  return {
    tenants: i.tenants, accountingTenantId: i.accountingTenantId, isArchived: false,
    index: `n:${i.filename}`, tags: 'invoice', folderKeys: [], fullPath: i.fullPath, description: '', title: i.filename,
    altText: i.filename, type: 'finance', source: 'storage', credit: '', url: '', mimeType: 'application/pdf',
    size: i.sizeBytes, authorKey: '', authorName: '', dateOfDocCreation: i.createdOn || i.today,
    dateOfDocLastUpdate: i.today, locationKey: '', hash: '', priorVersionKey: '', version: '', renderings: [],
  };
}
