// The operator's billing board (plan 2 Task 9): pure row building and the option initialisation of a tenant that
// switches to Stripe billing. operator.ts loads the documents and writes the results.
import { ADD_ON_BLOCKS } from '@okr/business-metering-util';
import { isTenantInvoice } from './my-invoices.logic';
import { openAmount, type InvoiceLike } from '../invoice/invoice-payment.logic';

/** `openAmount` covers all bkaiser invoices of the tenant in the operator books (subscription and top-ups, incl. reminder fees). */
export interface BillingOverviewRow {
  tenantId: string; name: string; billing: string; state: string; band: string; options: string[]; autopay: boolean;
  lastInvoice: { key: string; no: number; amount: number; state: string } | null;
  openAmount: number; failedAttempts: number; creditBalance: number; excludedUsers: number; flags: string[];
}

type Doc = Record<string, unknown>;
export interface OverviewInput {
  tenantIds: string[];
  subscriptions: Record<string, Doc>;
  names: Record<string, string>;
  credit: Record<string, number>;
  /** All operator-books invoices (any receiver). */
  invoices: { id: string; data: Doc }[];
  attempts: Doc[];
  books: string;
}

/** The paid options whose blocks are all enabled; `enabled` undefined = legacy tenant «all blocks». Options without blocks are never added. */
export function optionsFromEnabledBlocks(
  enabled: readonly string[] | undefined, map: Readonly<Record<string, readonly string[]>> = ADD_ON_BLOCKS,
): string[] {
  return Object.keys(map).filter(o => map[o].length > 0 && (enabled === undefined || map[o].every(b => enabled.includes(b))));
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export function buildOverview(input: OverviewInput): BillingOverviewRow[] {
  const ids = [...new Set([...input.tenantIds, ...Object.keys(input.subscriptions)])].sort();
  return ids.map(tenantId => {
    const sub = input.subscriptions[tenantId];
    const mine = input.invoices
      .filter(i => isTenantInvoice(i.data, input.books, tenantId))
      .sort((a, b) => {
        const da = String(a.data['invoiceDate'] ?? ''), db = String(b.data['invoiceDate'] ?? '');
        return da < db ? 1 : da > db ? -1 : num(b.data['invoiceNo']) - num(a.data['invoiceNo']);
      });
    const sinv = mine.find(i => i.data['billingKind'] === 'subscription');
    const openKeys = new Set(mine.filter(i => openAmount(i.data as unknown as InvoiceLike) > 0).map(i => i.id));
    const att = input.attempts.filter(a => a['payerTenantId'] === tenantId);
    const flags = new Set<string>(Array.isArray(sub?.['billingFlags']) ? (sub['billingFlags'] as string[]) : []);
    if (att.some(a => a['state'] === 'overpaid')) flags.add('overpaid');
    if (att.some(a => a['state'] === 'disputed')) flags.add('disputed');
    const measurement = sub?.['lastMeasurement'] as { excludedUsers?: number } | null | undefined;
    return {
      tenantId,
      name: input.names[tenantId] || tenantId,
      billing: String(sub?.['billing'] ?? 'exempt'),
      state: String(sub?.['state'] ?? 'active'),
      band: String(sub?.['currentBand'] ?? ''),
      options: Array.isArray(sub?.['options']) ? (sub['options'] as string[]) : [],
      autopay: sub?.['autopay'] === true,
      lastInvoice: sinv ? {
        key: sinv.id, no: num(sinv.data['invoiceNo']),
        amount: (sinv.data['totalAmount'] as { amount?: number } | undefined)?.amount ?? 0, state: String(sinv.data['state'] ?? ''),
      } : null,
      openAmount: mine.reduce((s, i) => s + Math.max(0, openAmount(i.data as unknown as InvoiceLike)), 0),
      failedAttempts: att.filter(a => a['state'] === 'failed' && openKeys.has(String(a['invoiceKey'] ?? ''))).length,
      creditBalance: input.credit[tenantId] ?? 0,
      excludedUsers: num(measurement?.excludedUsers),
      flags: [...flags],
    };
  });
}
