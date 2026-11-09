import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';
import type { SavedPaymentMethod } from '@okr/shared-models';

const BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
};

function brandName(brand: string): string {
  const key = (brand ?? '').toLowerCase();
  return BRAND_NAMES[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
}

/**
 * The saved payment method in one line: `Visa ••4242, 08/28` or `PayPal name@example.ch`. '' when there is none —
 * `paymentMethod` is null after a removal and absent on a subscription doc written before the field existed.
 */
export function paymentMethodLabel(pm: SavedPaymentMethod | null | undefined): string {
  if (!pm) return '';
  if (pm.type === 'paypal') return `PayPal ${pm.email ?? ''}`.trim();
  const label = `${brandName(pm.brand)} ••${pm.last4 ?? ''}`.trim();
  if (!pm.expMonth || !pm.expYear) return label;
  return `${label}, ${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear % 100).padStart(2, '0')}`;
}

/** Why a top-up of `rappen` would be refused by createTopUpInvoice: 'min', 'max' or '' (fine). */
export function topUpAmountError(rappen: number): '' | 'min' | 'max' {
  if (!Number.isInteger(rappen) || rappen < MIN_TOPUP) return 'min';
  if (rappen > MAX_TOPUP) return 'max';
  return '';
}

/**
 * CHF of a Rappen amount, Swiss-grouped with two decimals: 123456 → `1'234.56`. Grouped by hand, not by
 * toLocaleString, whose de-CH separator differs between ICU builds (`'` in Node, `’` in Chrome).
 */
export function formatChfAmount(rappen: number): string {
  const abs = Math.abs(Math.round(rappen || 0));
  const francs = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const text = `${francs}.${String(abs % 100).padStart(2, '0')}`;
  return rappen < 0 && abs > 0 ? `-${text}` : text;
}

/** A ledger amount with its sign: `+50.00` credited, `−1.50` debited, `0.00`. */
export function formatSignedChf(rappen: number): string {
  if (!rappen) return formatChfAmount(0);
  return `${rappen > 0 ? '+' : '−'}${formatChfAmount(Math.abs(rappen))}`;
}

/** What the pay page shows when createInvoicePaymentSession refuses. */
export type PayErrorKind = 'paid' | 'not-tenant' | 'error';

/**
 * Reads a createInvoicePaymentSession rejection: failed-precondition with reason 'receiver-not-a-tenant' → the
 * receiver cannot pay online; failed-precondition without a reason is the server's 'not-open' (nothing left to pay);
 * anything else (denied, not found, network) → a plain error.
 */
export function payErrorKind(err: unknown): PayErrorKind {
  const e = err as { code?: string; details?: { reason?: string } } | null | undefined;
  if (e?.code !== 'functions/failed-precondition') return 'error';
  return e.details?.reason === 'receiver-not-a-tenant' ? 'not-tenant' : 'paid';
}
