import { TRANSACTION_PRICES } from '@okr/business-metering-util';
import type { SendingState } from '@okr/shared-models';

/** The category Pingen reports a letter under (webhook payload). */
export type PingenCategory = 'issues' | 'sent' | 'undeliverable' | 'delivered';

/** States a sending never leaves again. */
export const SENDING_FINAL: SendingState[] = ['sent', 'delivered', 'failed', 'undeliverable'];

const ORDER: Record<SendingState, number> = {
  queued: 0,
  submitting: 1,
  submitted: 2,
  sent: 3,
  delivered: 4,
  failed: 99,
  undeliverable: 99,
};

/**
 * The state a Pingen webhook moves a sending to, or `undefined` if the event is history only.
 * Never moves backwards. A rejection fails a letter only from `queued`/`submitting`/`submitted`. `failed` and `undeliverable` are terminal, `undeliverable` may follow `sent`.
 * `rejected` only matters for the `issues` category (Pingen rejected the letter).
 */
export function nextSendingState(
  current: SendingState,
  category: PingenCategory,
  rejected: boolean,
): SendingState | undefined {
  if (current === 'failed' || current === 'undeliverable' || current === 'delivered') return undefined;
  let target: SendingState | undefined;
  switch (category) {
    case 'issues':
      // A letter already handed to the post (sent) was produced: a late rejection is history only.
      target = rejected && (current === 'queued' || current === 'submitting' || current === 'submitted') ? 'failed' : undefined;
      break;
    case 'sent':
    case 'delivered':
    case 'undeliverable':
      target = category;
      break;
  }
  if (!target) return undefined;
  if (target === 'failed') return target;
  if (target === 'undeliverable') return current === 'sent' ? target : undefined;
  return ORDER[target] > ORDER[current] ? target : undefined;
}

/**
 * Whether an address is Swiss. Callers pass `AddressModel.countryCode`. Our addresses default to CH,
 * so a missing or empty code counts as Swiss.
 */
export function isSwissAddress(countryCode: string | undefined): boolean {
  const code = (countryCode ?? '').trim().toUpperCase();
  return code === '' || code === 'CH';
}

/** One letter is one unit of a Versand, with its page count. */
export function letterShare(pages: number): { units: 1; pages: number } {
  return { units: 1, pages };
}

/** A Versand with this many address issues is held back for review. */
export function shouldHoldVersand(addressIssues: number): boolean {
  return addressIssues >= 3;
}

/** An amount in Rappen as the books show it: `CHF 1.20`. */
export function formatChf(rappen: number): string {
  return `CHF ${(rappen / 100).toFixed(2)}`;
}

/** The two lines of the cost box: what a letter and what a page cost, and the sums for this Versand. */
export interface PostCostLines {
  /** price of one letter, e.g. `CHF 1.20` */
  letterPrice: string;
  letterTotal: string;
  /** price of one page, e.g. `CHF 0.30` */
  pagePrice: string;
  pageTotal: string;
}

/**
 * The cost box lines for a Versand. The rates come from the pricing table the server bills with
 * (`TRANSACTION_PRICES`), never from a number typed into the UI; the quote's total stays the amount that is charged.
 */
export function postCostLines(letters: number, pages: number): PostCostLines {
  const price = TRANSACTION_PRICES['pingen-letter'];
  const billablePages = Math.max(0, pages - price.includedPages * letters);
  return {
    letterPrice: formatChf(price.perUnit),
    letterTotal: formatChf(price.perUnit * letters),
    pagePrice: formatChf(price.perPage),
    pageTotal: formatChf(price.perPage * billablePages),
  };
}
