import { ADD_ON_PRICES, addOnTotal, BANDS, optionBlocks, priceOfBand } from '@okr/business-metering-util';
import type { BandId, BillingMode, SubscriptionState } from '@okr/shared-models';

import type { COLLECTION_I18N_KEYS } from './collection-i18n';

/** What the «Abo» card shows: the subscription state, or `exempt` (a contract with bkaiser, design §7.12). */
export type AboStateKey = 'exempt' | SubscriptionState;

const STATES: readonly SubscriptionState[] = ['active', 'pastDue', 'closing', 'closed', 'cancelled'];

/**
 * The state key of a subscription as read: Firestore reads skip model defaults, so `billing` may be missing (the
 * model default is 'exempt') and `state` may be missing or unknown (both read as 'active').
 */
export function aboStateKey(sub: { billing?: BillingMode | string; state?: SubscriptionState | string }): AboStateKey {
  if (sub.billing !== 'stripe') return 'exempt';
  return STATES.includes(sub.state as SubscriptionState) ? (sub.state as SubscriptionState) : 'active';
}

/** Weighted users from which a tenant is priced individually; mirrors INDIVIDUAL_PRICING_FROM of the monthly run. */
const INDIVIDUAL_FROM = 1000;

export type NextInvoiceEstimate =
  | { kind: 'amount'; amount: number } // Rappen
  | { kind: 'unmeasured'; amount: 0 } // no band measured yet
  | { kind: 'individual'; amount: 0 }; // priced individually, the run does not invoice it

/**
 * The next monthly invoice as the run would compute it today: the price of the current band plus the flat prices of
 * the subscribed options (Rappen, excl. VAT). A forecast only — the band is measured again at the end of the month.
 */
export function nextInvoiceEstimate(band: BandId | '' | undefined, options: readonly string[] | undefined): NextInvoiceEstimate {
  const b = BANDS.find(x => x.id === band);
  if (!b) return { kind: 'unmeasured', amount: 0 };
  if (b.from >= INDIVIDUAL_FROM) return { kind: 'individual', amount: 0 };
  return { kind: 'amount', amount: Math.round((priceOfBand(b.id) + addOnTotal(options ?? []).total) * 100) };
}

/** An option can be booked once a feature block exists for it; until then the card shows «bald verfügbar». */
export function isOptionAvailable(optionId: string): boolean {
  return optionBlocks(optionId).length > 0;
}

export interface OptionRow {
  id: string;
  /** CHF per month */
  price: number;
  available: boolean;
  subscribed: boolean;
}

/** Every priced option in price-table order, with its price, availability and whether the tenant has it. */
export function optionRows(subscribed: readonly string[] | undefined): OptionRow[] {
  const mine = new Set(subscribed ?? []);
  return Object.keys(ADD_ON_PRICES).map(id => ({
    id, price: ADD_ON_PRICES[id], available: isOptionAvailable(id), subscribed: mine.has(id),
  }));
}

/** The i18n key name of an option's display name (`projekte-zeiterfassung` → `option_projekte_zeiterfassung`). */
export function optionI18nKey(optionId: string): keyof typeof COLLECTION_I18N_KEYS | undefined {
  if (!Object.prototype.hasOwnProperty.call(ADD_ON_PRICES, optionId)) return undefined;
  return `option_${optionId.replace(/-/g, '_')}` as keyof typeof COLLECTION_I18N_KEYS;
}

/** One of the tenant's own bkaiser invoices, as listMyBillingInvoices returns it (amounts in Rappen). */
export interface MyBillingInvoice {
  invoiceKey: string; invoiceNo: number; invoiceDate: string; dueDate: string; totalAmount: number;
  openAmount: number; state: string; billingKind: string; title: string;
}

export type InvoiceStateKind = 'open' | 'overdue' | 'partial' | 'paid' | 'cancelled';

/** How the invoice list labels an invoice; `today` is a StoreDate (yyyyMMdd). */
export function invoiceStateKind(inv: MyBillingInvoice, today: string): InvoiceStateKind {
  if (inv.state === 'cancelled') return 'cancelled';
  if (inv.openAmount <= 0) return 'paid';
  if (inv.dueDate && inv.dueDate < today) return 'overdue';
  return inv.state === 'partial' ? 'partial' : 'open';
}

/** «Online bezahlen» is offered while something is open on a not cancelled invoice. */
export function isInvoicePayable(inv: MyBillingInvoice): boolean {
  return inv.state !== 'cancelled' && inv.openAmount > 0;
}

/** One tenant on the operator board, as getBillingOverview returns it (amounts in Rappen). */
export interface BillingOverviewRow {
  tenantId: string; name: string; billing: string; state: string; band: string; options: string[]; autopay: boolean;
  lastInvoice: { key: string; no: number; amount: number; state: string } | null;
  openAmount: number; failedAttempts: number; creditBalance: number; excludedUsers: number; flags: string[];
}

/** 'all' or an AboStateKey (exempt = contract tenants). */
export type BoardStateFilter = 'all' | AboStateKey;

/** The rows matching the state filter and the flag filter ('all' = no filter). */
export function filterBoardRows(rows: readonly BillingOverviewRow[], state: BoardStateFilter, flag: string): BillingOverviewRow[] {
  return rows.filter(r =>
    (state === 'all' || aboStateKey(r) === state) && (flag === 'all' || (r.flags ?? []).includes(flag)));
}

/** The flags present on the board, sorted, each once — the choices of the flag filter. */
export function boardFlags(rows: readonly BillingOverviewRow[]): string[] {
  return [...new Set(rows.flatMap(r => r.flags ?? []))].sort();
}
