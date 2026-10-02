import { AddressModel, InvoiceModel, UserModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';

import { buildRecipientPayload, formatChf, ReceiptParty } from '@okr/finance-booking-util';

/** `templates/{id}` rendered by the 'Zahlungsbestätigung erstellen' action. Must have a published version. */
export const PAYMENT_CONFIRMATION_TEMPLATE_ID = 'r9poptz0k6fw5rq56v0w';

/** Fields the template needs that come from no model (merged under the dynamic payload). */
export const PAYMENT_CONFIRMATION_STATIC_PAYLOAD: Record<string, string> = {
  logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/scs-wordmark.png',
};

/** A payment confirmation is only offered for a paid invoice with a known receiver. */
export function canCreatePaymentConfirmation(invoice: InvoiceModel): boolean {
  return invoice.state === 'paid' && !!invoice.receiver?.key;
}

/**
 * Who may read an invoice's documents (its PDF, its payment confirmation): treasurer, privileged and
 * admin for every invoice, a member for the invoices addressed to them. The same rule as the
 * showInvoicePdf and createPaymentConfirmation callables.
 */
export function mayReadInvoiceDocuments(invoice: InvoiceModel, user: UserModel | undefined): boolean {
  if (!user) return false;
  if (hasRole('treasurer', user) || hasRole('privileged', user)) return true;
  return !!user.personKey && user.personKey === invoice.receiver?.key;
}

function toViewDate(storeDate: string): string {
  return storeDate ? convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
}

/**
 * Fields for the payment-confirmation template:
 * - invoice: invoiceId, invoiceTitle (Betreff), invoiceDate, payDate, amount (dates DD.MM.YYYY, amount "1'000.00")
 * - recipient: greeting, firstName, lastName, streetName, streetNumber, zipCode, city
 * - static: logoUrl
 * The payee (sender, IBAN) is resolved by the Cloud Function from the template's payeeOrgId.
 */
export function buildPaymentConfirmationPayload(
  invoice: InvoiceModel,
  party: ReceiptParty,
  address: AddressModel,
): Record<string, string> {
  return {
    ...PAYMENT_CONFIRMATION_STATIC_PAYLOAD,
    ...buildRecipientPayload(party, address),
    amount: formatChf(invoice.totalAmount?.amount ?? 0),
    invoiceId: invoice.invoiceId,
    invoiceTitle: invoice.title,
    invoiceDate: toViewDate(invoice.invoiceDate),
    payDate: toViewDate(invoice.paymentDate),
  };
}
