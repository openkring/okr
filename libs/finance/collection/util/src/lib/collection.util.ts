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

/** MIN_TOPUP and MAX_TOPUP as CHF text, for `{min}` / `{max}` in the i18n strings. */
export function topUpBounds(): { min: string; max: string } {
  return { min: formatChfAmount(MIN_TOPUP), max: formatChfAmount(MAX_TOPUP) };
}

const ZURICH_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** A Date as StoreDateTime on the Zurich wall clock — the clock the functions stamp `consentAt` with. */
export function zurichStoreDateTime(date: Date): string {
  const p = Object.fromEntries(ZURICH_PARTS.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p['year']}${p['month']}${p['day']}${p['hour']}${p['minute']}${p['second']}`;
}

/** How long after the webhook wrote it a method still counts as «just saved» when the page loads after it. */
export const FRESH_METHOD_MS = 10 * 60 * 1000;

export type StripeReturnNotice = '' | 'saved' | 'saving' | 'cancelled';

/**
 * The notice of /billing after the Stripe setup redirect. `baselineId` is the saved method's id on the first
 * subscription emission after landing ('' = none; undefined = not read yet). With `done`, «saved» shows only when the
 * method now differs from that snapshot, or when its consent is younger than FRESH_METHOD_MS (the webhook wrote it
 * before the page loaded, so the snapshot already holds it). Otherwise — a stale doc still holding the old method —
 * «saving». With `cancel`, «cancelled» only when no method is saved.
 */
export function stripeReturnNotice(
  stripe: string | undefined, pm: SavedPaymentMethod | null | undefined, baselineId: string | undefined, now: Date,
): StripeReturnNotice {
  if (stripe === 'cancel') return pm ? '' : 'cancelled';
  if (stripe !== 'done') return '';
  if (!pm) return 'saving';
  const id = pm.stripePaymentMethodId ?? '';
  if (baselineId !== undefined && id !== baselineId) return 'saved';
  const freshFrom = zurichStoreDateTime(new Date(now.getTime() - FRESH_METHOD_MS));
  const consentAt = pm.consentAt ?? '';
  return consentAt.length === 14 && consentAt >= freshFrom ? 'saved' : 'saving';
}
