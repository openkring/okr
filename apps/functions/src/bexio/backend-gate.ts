import type { Firestore } from 'firebase-admin/firestore';

/** The bexio schedulers only run while the accounting tenant is still bexio-managed (spec 1.68 D13). */
export function isBexioBackend(config: { accountingBackend?: string } | undefined): boolean {
  return (config?.accountingBackend ?? 'native') === 'bexio';
}

/**
 * The books an invoice belongs to — its own `accountingTenantId`, never the app tenant (`tenants[0]`):
 * one app tenant keeps several books (scs holds scs and gss), so a fallback would pick the wrong ones.
 */
export function invoiceBooksId(invoice: { accountingTenantId?: unknown } | undefined): string {
  const id = invoice?.accountingTenantId;
  return typeof id === 'string' ? id : '';
}

export async function loadIsBexioBackend(db: Firestore, accountingTenantId: string): Promise<boolean> {
  const snap = await db.collection('accounting-configs').doc(accountingTenantId).get();
  return isBexioBackend(snap.data() as { accountingBackend?: string } | undefined);
}
