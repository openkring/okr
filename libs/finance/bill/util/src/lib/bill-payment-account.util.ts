/** The account of ours a booked bill will be paid from (spec 1.94 §3.2) — one of the books' billPaymentAccountKeys. */
export type PaymentAccountResult = { key: string } | { refusal: 'payment-account-required' | 'payment-account-invalid' };

/** true when the books configure several payment accounts, so the treasurer has to pick one. */
export function needsPaymentAccountChoice(configured: string[]): boolean {
  return configured.length > 1;
}

/**
 * The paying account to store: a requested key must be one of the configured ones; without a request the only
 * configured account is the default, none configured leaves it empty, several configured require a choice.
 */
export function resolvePaymentAccountKey(requested: string | undefined, configured: string[]): PaymentAccountResult {
  const key = (requested ?? '').trim();
  if (key) return configured.includes(key) ? { key } : { refusal: 'payment-account-invalid' };
  if (configured.length === 1) return { key: configured[0] };
  if (configured.length === 0) return { key: '' };
  return { refusal: 'payment-account-required' };
}
