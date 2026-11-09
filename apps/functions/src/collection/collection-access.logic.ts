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

export interface OpenAttempt {
  id: string;
  createdBy: string;
  offerSave: boolean;
  amount: number;
  checkoutUrl: string;
  stripeCheckoutSessionId: string;
}

/**
 * Of the open, unexpired attempts for one invoice and payer: the one to hand back (same creator, same
 * save choice, same open amount, has a URL), and the others, whose Stripe session must be expired.
 */
export function pickReusableAttempt(
  attempts: OpenAttempt[], want: { uid: string; offerSave: boolean; amount: number },
): { reuse: OpenAttempt | undefined; stale: OpenAttempt[] } {
  const matches = (a: OpenAttempt): boolean => a.createdBy === want.uid && a.offerSave === want.offerSave && a.amount === want.amount && a.checkoutUrl !== '';
  const reuse = attempts.find(matches);
  return { reuse, stale: attempts.filter((a) => a !== reuse) };
}
