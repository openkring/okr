/**
 * Who may read an invoice's documents (its PDF, its payment confirmation). Mirrors the `invoices`
 * read rule in firestore.rules: admin (also the legacy custom claim), treasurer and privileged reach
 * every invoice of the tenant, a plain member only the invoices addressed to them
 * (`receiver.key` == their own personKey). Pure: the caller reads the user and the invoice.
 */
export function mayReadInvoice(i: {
  adminClaim: boolean;
  roles: Record<string, boolean> | undefined;
  personKey: string;
  receiverKey: string;
}): boolean {
  if (i.adminClaim) return true;
  if (i.roles?.['admin'] === true || i.roles?.['treasurer'] === true || i.roles?.['privileged'] === true) return true;
  return !!i.personKey && i.personKey === i.receiverKey;
}
