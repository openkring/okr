import { isPayableState } from '../invoice/invoice-payment.logic';

/** May this caller pay this invoice online? Admin of the receiver tenant, or treasurer/privileged of the invoice's books. */
export function canPayInvoice(
  caller: { tenantId: string; isAdmin: boolean; isTreasurerOfBooks: boolean },
  invoice: { receiverKey: string; receiverIsTenant: boolean; state: string; openAmount: number },
): 'ok' | 'denied' | 'not-open' | 'receiver-not-a-tenant' {
  const isReceiverAdmin = caller.isAdmin && caller.tenantId === invoice.receiverKey;
  if (!isReceiverAdmin && !caller.isTreasurerOfBooks) return 'denied';
  if (!invoice.receiverKey || !invoice.receiverIsTenant) return 'receiver-not-a-tenant';
  if (!isPayableState(invoice.state) || invoice.openAmount <= 0) return 'not-open';
  return 'ok';
}
