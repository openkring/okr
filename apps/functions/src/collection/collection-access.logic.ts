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
  /** 'open', or 'failed' (a card declined inside Checkout: the session itself is still live). */
  state: string;
  createdBy: string;
  offerSave: boolean;
  amount: number;
  checkoutUrl: string;
  stripeCheckoutSessionId: string;
}

/** Attempt states whose Checkout session may still take a payment until its expiresAt. */
export const LIVE_SESSION_STATES = ['open', 'failed'];

/**
 * Of the unexpired attempts in LIVE_SESSION_STATES for one invoice and payer: the one to hand back (state open,
 * same creator, same save choice, same open amount, has a URL), and the others, whose Stripe session must be
 * expired. A failed attempt is never reused; it is stale only while it has a Checkout session (one that failed
 * before Stripe created a session has nothing left to expire).
 */
export function pickReusableAttempt(
  attempts: OpenAttempt[], want: { uid: string; offerSave: boolean; amount: number },
): { reuse: OpenAttempt | undefined; stale: OpenAttempt[] } {
  const matches = (a: OpenAttempt): boolean =>
    a.state === 'open' && a.createdBy === want.uid && a.offerSave === want.offerSave && a.amount === want.amount && a.checkoutUrl !== '';
  const reuse = attempts.find(matches);
  const stale = attempts.filter((a) => a !== reuse && (a.state === 'open' || (a.state === 'failed' && a.stripeCheckoutSessionId !== '')));
  return { reuse, stale };
}

/**
 * The e-mail written to the tenant's Stripe customer (the receipt address). An existing customer only ever gets
 * the subscription's billingEmail (empty = leave Stripe's as it is): a caller's address never overwrites it, so an
 * operator treasurer paying on the tenant's behalf does not become its contact. A new customer gets billingEmail,
 * else the caller's address only when the caller is an admin of that tenant, else none. `callerEmail` is read lazily.
 */
export async function stripeCustomerEmail(input: {
  existingId: string; billingEmail: string; callerIsReceiverAdmin: boolean; callerEmail: () => Promise<string>;
}): Promise<string> {
  if (input.billingEmail) return input.billingEmail;
  if (input.existingId || !input.callerIsReceiverAdmin) return '';
  return input.callerEmail();
}
