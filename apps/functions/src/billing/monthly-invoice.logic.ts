import { ADD_ON_PRICES, applyHysteresis, bandOf, priceOfBand } from '@okr/business-metering-util';
import type { BandId } from '@okr/shared-models';

/** The subscription fields eligibility looks at. Firestore reads skip model defaults, so `state` may be absent. */
export interface SubscriptionLike {
  billing: 'exempt' | 'stripe';
  state?: 'active' | 'pastDue' | 'closing' | 'closed' | 'cancelled';
  billingStart?: string; // StoreDate
  lastRunPeriod?: string; // yyyyMM
}

export interface MonthlyPosition {
  title: string;
  /** Integer Rappen. */
  amount: number;
  accountKey: string;
}

/** Weighted users from which a tenant is priced individually (1.32); the run refuses these tenants. */
export const INDIVIDUAL_PRICING_FROM = 1000;

const MAX_BAND_HISTORY = 3;

/** The invoice period (yyyyMM) of a run on `runDate` (StoreDate): the month it is issued in, billed upfront. */
export function billingPeriod(runDate: string): string {
  return runDate.slice(0, 6);
}

/** First month billed: the month after billingStart's month, or that month itself when billingStart is its 1st. */
function firstBilledPeriod(billingStart: string): string {
  const month = billingStart.slice(0, 6);
  if (billingStart.slice(6, 8) === '01') return month;
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(4, 6));
  return m === 12 ? `${year + 1}01` : `${year}${String(m + 1).padStart(2, '0')}`;
}

function isValidStoreDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(4, 6));
  const d = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Whether the monthly run should invoice this subscription for `period` (yyyyMM). */
export function isBillable(sub: SubscriptionLike, period: string): boolean {
  if (sub.billing !== 'stripe') return false;
  const state = sub.state ?? 'active';
  if (state !== 'active' && state !== 'pastDue') return false;
  if ((sub.lastRunPeriod ?? '') === period) return false;
  if (sub.billingStart) {
    if (!isValidStoreDate(sub.billingStart)) return false; // malformed start: fail closed
    if (period < firstBilledPeriod(sub.billingStart)) return false;
  }
  return true;
}

/** Whether a measurement is priced individually instead of from the band table. */
export function isIndividuallyPriced(weighted: number): boolean {
  return weighted >= INDIVIDUAL_PRICING_FROM;
}

/**
 * The band to bill and the updated history. `history` holds MEASURED bands, newest first (max 3 kept).
 * Up immediately; down only after two consecutive months below: the billed band is the higher of this
 * month's and last month's measurement, which is `applyHysteresis` over the single previous entry.
 */
export function chooseBand(measuredWeighted: number, history: BandId[]): { band: BandId; history: BandId[] } {
  const measured = bandOf(measuredWeighted).id;
  const band = applyHysteresis(measured, history.slice(0, 1));
  return { band, history: [measured, ...history].slice(0, MAX_BAND_HISTORY) };
}

const PRODUCT_NAMES: Record<string, string> = { 'pingen-letter': 'Pingen' };

function monthName(period: string): string {
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4, 6)) - 1, 1));
  return new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * The invoice lines for `period`: the band, each paid option, and per transactional product of the previous
 * month a line of amount 0 (already settled from credit).
 * Returns `skipped`: option ids with no price in ADD_ON_PRICES — never billed; the caller logs them.
 */
export function monthlyPositions(input: {
  period: string;
  band: BandId;
  options: string[];
  credit: Array<{ product: string; units: number; pages: number; amount: number }>;
  accounts: { subscription: string; transaction: string };
}): { positions: MonthlyPosition[]; skipped: string[] } {
  const { period, band, accounts } = input;
  const month = monthName(period);
  const positions: MonthlyPosition[] = [
    { title: `Kring ${band.replace(/^Kring/, '')} — ${month}`, amount: Math.round(priceOfBand(band) * 100), accountKey: accounts.subscription },
  ];
  const skipped: string[] = [];
  for (const id of [...new Set(input.options)]) {
    const price = Object.prototype.hasOwnProperty.call(ADD_ON_PRICES, id) ? ADD_ON_PRICES[id] : undefined;
    if (typeof price !== 'number') {
      skipped.push(id);
      continue;
    }
    positions.push({ title: `${id} — ${month}`, amount: Math.round(price * 100), accountKey: accounts.subscription });
  }
  for (const c of input.credit) {
    const name = PRODUCT_NAMES[c.product] ?? c.product;
    positions.push({
      title: `${name}: ${c.units} Briefe, ${c.pages} Seiten — CHF ${(c.amount / 100).toFixed(2)} aus Guthaben bezahlt`,
      amount: 0,
      accountKey: accounts.transaction,
    });
  }
  return { positions, skipped };
}

/** The month before `period` (yyyyMM). */
export function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const m = Number(period.slice(4, 6));
  return m === 1 ? `${year - 1}12` : `${year}${String(m - 1).padStart(2, '0')}`;
}

/** A credit ledger entry as the run reads it (credit-accounts/{t}/entries). */
export interface CreditEntryLike {
  kind?: string;
  amount?: number; // signed Rappen: a deduction is negative, a reversal positive
  product?: string;
  units?: number;
  pages?: number;
}

/**
 * The past month's transactions per product, net of reversals: units, pages and amount (Rappen, positive) =
 * deductions − reversals. Other kinds (top-ups, corrections) are ignored; a product that nets to nothing is dropped.
 * Sorted by product id.
 */
export function creditOfMonth(entries: CreditEntryLike[]): Array<{ product: string; units: number; pages: number; amount: number }> {
  const byProduct = new Map<string, { product: string; units: number; pages: number; amount: number }>();
  for (const e of entries) {
    const sign = e.kind === 'deduction' ? 1 : e.kind === 'reversal' ? -1 : 0;
    if (sign === 0 || !e.product) continue;
    const sum = byProduct.get(e.product) ?? { product: e.product, units: 0, pages: 0, amount: 0 };
    sum.units += sign * Number(e.units ?? 0);
    sum.pages += sign * Number(e.pages ?? 0);
    sum.amount += sign * Math.abs(Number(e.amount ?? 0));
    byProduct.set(e.product, sum);
  }
  return [...byProduct.values()]
    .filter((c) => c.amount > 0 || c.units > 0)
    .sort((a, b) => a.product.localeCompare(b.product));
}
