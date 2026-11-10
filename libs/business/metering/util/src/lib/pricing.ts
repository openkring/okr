/**
 * The NORMATIVE Kring price table, in code.
 *
 * Transcribed from [`planning/specs/2026-08-04-kring-pricing-spec.md`](../../../../../../planning/specs/2026-08-04-kring-pricing-spec.md)
 * §4 and §7 — that document is the single source of truth, this file is its executable copy.
 * Change one and you must change the other in the same commit.
 *
 * ⚠️ **Never derive a price from the formula.** The spec's `f(n) = 9 + 0.16·n^(3/4)` is labelled
 * explicitly NON-normative: it exists to explain the *shape* of the curve. A price computed from it
 * and a price read from this table disagree by up to CHF 2.17, and the table wins — a mismatch is a
 * documentation bug, never a pricing bug. This is not hypothetical: two undocumented multipliers
 * (1.8×/2.5× above 500 users) once lived in the websites' calculator and would have paid partners
 * about half of what their own calculator quoted the customer.
 */

import type { BandId, RoleName } from '@okr/shared-models';

/** A band id. Stable, and a SKU key — never rename one for a live tenant. Defined in shared-models. */
export type { BandId };

export interface Band {
  id: BandId;
  /** Inclusive lower bound of weighted users. */
  from: number;
  /** Inclusive upper bound; `Infinity` for the capped top band. */
  to: number;
  /** CHF per month, excl. MWST. */
  price: number;
}

/** Pricing spec §4. Ordered ascending; the last band is the absolute cap. */
export const BANDS: readonly Band[] = [
  { id: 'KringXXS',  from: 1,    to: 25,       price: 9 },
  { id: 'KringXS',   from: 26,   to: 50,       price: 12 },
  { id: 'KringS',    from: 51,   to: 100,      price: 15 },
  { id: 'KringM',    from: 101,  to: 249,      price: 19 },
  { id: 'KringL',    from: 250,  to: 499,      price: 25 },
  { id: 'KringXL',   from: 500,  to: 999,      price: 39 },
  { id: 'KringXXL',  from: 1000, to: 1999,     price: 59 },
  { id: 'KringXXXL', from: 2000, to: Infinity, price: 99 },
] as const;

/**
 * Pricing spec §7 — flat, band-independent add-on prices in CHF/month, by stable id.
 *
 * The ids are the SKU keys the metering payload reports and, once the 1.32 §8.4 follow-up splits
 * `finance` in the feature catalogue, the catalogue block ids too. An unknown id contributes 0 and
 * is NOT an error here: a partner running a newer openkring may report an add-on this deployment
 * has never heard of, and losing the whole month's commission over one unrecognised string would
 * be worse than under-charging by one add-on. `unknownAddOns` surfaces it instead.
 */
export const ADD_ON_PRICES: Readonly<Record<string, number>> = {
  buchhaltung: 20,
  crm: 10,
  lohnbuchhaltung: 5,
  'projekte-zeiterfassung': 5,
  kostenrechnung: 5,
  shop: 5,
  'spesen-ocr': 5,
  anlagen: 5,
  logbuch: 5,
};

/**
 * Which feature-catalogue block ids each paid option switches on (option id -> block ids). Owner decision
 * 2026-11-10 (1.32 §8.4, the `finance` split): one option, one block. An option mapped to [] is not sellable
 * yet (no block exists) — `setSubscriptionOptions` refuses it and the Abo page shows «bald verfügbar».
 */
export const ADD_ON_BLOCKS: Readonly<Record<string, readonly string[]>> = {
  buchhaltung: ['finance'],
  crm: ['business'],
  lohnbuchhaltung: [],
  'projekte-zeiterfassung': [],
  kostenrechnung: ['cost-accounting'],
  shop: [],
  'spesen-ocr': ['expense'],
  anlagen: ['asset'],
  logbuch: ['trip'],
};

/** The catalogue blocks of a paid option ([] when unknown or not mapped yet). Pass `map` to override (tests). */
export function optionBlocks(optionId: string, map: Readonly<Record<string, readonly string[]>> = ADD_ON_BLOCKS): string[] {
  return Object.prototype.hasOwnProperty.call(map, optionId) ? [...map[optionId]] : [];
}

/** Commission share of the partner channel — C2 Ziff. 4.2 / parent spec D4. */
export const COMMISSION_RATE = 0.1;

/**
 * The eight roles that count double — pricing spec §9.1 (4), copied verbatim. `registered` and
 * `auditor` count once; `kiosk` and `tester` are not billable users.
 */
export const BILLING_PRIVILEGED_ROLES: readonly RoleName[] = [
  'privileged',
  'admin',
  'contentAdmin',
  'resourceAdmin',
  'memberAdmin',
  'eventAdmin',
  'treasurer',
  'groupAdmin',
];

/**
 * §9.1 (4): `kiosk` (shared device login) is not a billable person, but only a kiosk-ONLY account
 * (no other true role, same predicate as `isKioskOnly()`): `registered` + `kiosk` is a full member.
 * `tester` grants no restriction and is never excluded by role; internal test accounts are listed by
 * uid in the operator-only `platform-config/billing-private.excludedUids`.
 */
export const BILLING_EXCLUDED_ROLES: readonly RoleName[] = ['kiosk'];

/**
 * Weighted user count `n` (pricing §3): privileged accounts count **double**.
 *
 * Both inputs arrive already filtered by the partner's own installation under §9.1's rules
 * (not archived, not disabled, measured on the last day of the month, the eight named privileged
 * roles) — that logic ships inside the product precisely so a partner cannot reinterpret
 * "privileged". This function only applies the weighting.
 */
export function weightedUsers(totalUsers: number, privilegedUsers: number): number {
  return Math.max(0, totalUsers) + Math.max(0, privilegedUsers);
}

/**
 * The band `n` falls into. `n = 0` (a tenant with no accounts at all) still maps to the floor
 * band: pricing §2 says CHF 9 is the floor and there is no free tenant, so an empty tenant is a
 * cheap tenant, not a free one.
 */
export function bandOf(n: number): Band {
  return BANDS.find(b => n >= b.from && n <= b.to) ?? BANDS[0];
}

export function priceOfBand(id: BandId): number {
  return BANDS.find(b => b.id === id)?.price ?? 0;
}

/** Index of a band in the ascending table — the only meaningful way to compare two bands. */
export function bandRank(id: BandId): number {
  return BANDS.findIndex(b => b.id === id);
}

export interface AddOnTotal {
  total: number;
  /** Reported ids this deployment does not price — logged, never fatal (see `ADD_ON_PRICES`). */
  unknown: string[];
}

/** Sum of the flat add-on prices. Duplicates in the input are counted once. */
export function addOnTotal(addOns: readonly string[]): AddOnTotal {
  const unique = [...new Set(addOns)];
  const unknown = unique.filter(id => ADD_ON_PRICES[id] === undefined);
  const total = unique.reduce((sum, id) => sum + (ADD_ON_PRICES[id] ?? 0), 0);
  return { total, unknown };
}

/**
 * The band actually billed, applying pricing §9.1's **hysteresis**: up immediately, down only
 * after the threshold has been undercut for **two consecutive months**.
 *
 * @param measured the band this month's count alone would give
 * @param history  the bands BILLED in previous months, most recent first. Only the most recent
 *                 two are read; passing more is harmless.
 *
 * Without this a tenant hovering around 1'000 weighted users flips CHF 39 ↔ 59 every month, and
 * every flip is a support conversation. The asymmetry errs in the customer's favour going up and
 * protects them from a one-month dip being clawed back going down.
 *
 * Deliberately a function of the BILLED history, not of past measurements: what a tenant paid is
 * a fact on an invoice, while a recomputed measurement silently changes when the table does.
 */
export function applyHysteresis(measured: BandId, history: readonly BandId[]): BandId {
  const previous = history[0];
  if (previous === undefined) return measured;                    // first month: nothing to hold
  if (bandRank(measured) >= bandRank(previous)) return measured;  // up (or flat) — immediate

  // Down: hold the previous band unless the month before ALSO measured below it. `history[1]` is
  // the band that was billed then, which equals `previous` while a drop is still being held —
  // so a second consecutive low month is the first time the two differ from `measured` alike.
  const beforeThat = history[1];
  const secondConsecutiveDrop = beforeThat !== undefined && bandRank(beforeThat) > bandRank(measured)
    && bandRank(previous) > bandRank(measured) && previous === beforeThat;
  return secondConsecutiveDrop ? measured : previous;
}

export interface CommissionInput {
  totalUsers: number;
  privilegedUsers: number;
  addOns: readonly string[];
  /** Bands billed to this tenant in previous months, most recent first. */
  history?: readonly BandId[];
}

export interface CommissionResult {
  weightedUsers: number;
  band: BandId;
  bandPrice: number;
  addOnTotal: number;
  subtotal: number;
  commission: number;
  unknownAddOns: string[];
}

/** Round to five centimes — the smallest unit a Swiss invoice can carry. */
export function roundToFiveCentimes(amount: number): number {
  return Math.round(amount * 20) / 20;
}

/**
 * One tenant's monthly contribution to a partner's commission (C3 §7).
 *
 * The CHF 9 floor counts and add-ons count, so there is no free tenant and no untaxed upsell
 * (pricing §8.2). Per tenant, never per partner: the table is concave and stepped, so one tenant
 * of 400 weighted users (KringL, CHF 25 → CHF 2.50) and eight of 50 (8 × KringXS, CHF 96 →
 * CHF 9.60) are the same 400 users and 3.8× the commission.
 */
export function commissionForTenant(input: CommissionInput): CommissionResult {
  const n = weightedUsers(input.totalUsers, input.privilegedUsers);
  const band = applyHysteresis(bandOf(n).id, input.history ?? []);
  const bandPrice = priceOfBand(band);
  const addOns = addOnTotal(input.addOns);
  const subtotal = bandPrice + addOns.total;
  return {
    weightedUsers: n,
    band,
    bandPrice,
    addOnTotal: addOns.total,
    subtotal,
    commission: roundToFiveCentimes(subtotal * COMMISSION_RATE),
    unknownAddOns: addOns.unknown,
  };
}

/**
 * Transaction prices (pricing spec §7.2) — per-use costs paid from a prepaid tenant credit, not
 * monthly add-ons. Amounts are integer Rappen, excl. MWST.
 */
export type TransactionProduct = 'pingen-letter';

export interface TransactionPrice {
  /** Price of one unit (one letter), Rappen. Excludes all pages; pages are priced by `perPage`. */
  perUnit: number;
  /** Price of every page, the first one included, Rappen. */
  perPage: number;
  /** Pages per unit covered by `perUnit`. Always 0 now that every page is charged. */
  includedPages: number;
}

/** Owner decision 2026-11-09: CHF 1.20 per letter excl. pages, plus CHF 0.30 for every page. */
export const TRANSACTION_PRICES: Readonly<Record<TransactionProduct, TransactionPrice>> = {
  'pingen-letter': { perUnit: 120, perPage: 30, includedPages: 0 },
};

export interface TransactionQuote {
  product: TransactionProduct;
  units: number;
  pages: number;
  /** The per-unit rate from the table (Rappen), not the sum over all units. */
  unitPrice: number;
  /** The per-page rate from the table (Rappen), not the sum over all pages. */
  pagePrice: number;
  /** Total cost in Rappen: `units * unitPrice` plus the billable pages at `pagePrice`. */
  total: number;
}

/**
 * Prices `units` transactions carrying `pages` pages in total (Rappen).
 *
 * @throws RangeError when `units` is not a positive integer, or `pages` is not an integer of at
 *   least `units` (every unit has at least one page).
 */
export function quoteTransaction(product: TransactionProduct, units: number, pages: number): TransactionQuote {
  if (!Number.isInteger(units) || units < 1) {
    throw new RangeError(`units must be a positive integer, got ${units}`);
  }
  if (!Number.isInteger(pages) || pages < units) {
    throw new RangeError(`pages must be an integer of at least ${units}, got ${pages}`);
  }
  const price = TRANSACTION_PRICES[product];
  return {
    product,
    units,
    pages,
    unitPrice: price.perUnit,
    pagePrice: price.perPage,
    total: transactionAmount(price, units, pages),
  };
}

/**
 * The one billing rule of a transaction (Rappen): `units * perUnit` plus the pages beyond the included ones
 * at `perPage`. No validation: `quoteTransaction` checks a whole send; a partial reversal of a send (one
 * rejected letter) reuses the rule with the prices stored on its entry.
 */
export function transactionAmount(price: TransactionPrice, units: number, pages: number): number {
  const billablePages = Math.max(0, pages - units * price.includedPages);
  return units * price.perUnit + billablePages * price.perPage;
}

/** Smallest prepaid top-up (Rappen), CHF 50. */
export const MIN_TOPUP = 5000;
/** Largest prepaid top-up (Rappen), CHF 5'000. */
export const MAX_TOPUP = 500000;
