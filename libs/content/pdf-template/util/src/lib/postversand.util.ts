import type { SendingState } from '@okr/shared-models';

/** The category Pingen reports a letter under (webhook payload). */
export type PingenCategory = 'issues' | 'sent' | 'undeliverable' | 'delivered';

/** States a sending never leaves again. */
export const SENDING_FINAL: SendingState[] = ['sent', 'delivered', 'failed', 'undeliverable'];

const ORDER: Record<SendingState, number> = {
  queued: 0,
  submitted: 1,
  sent: 2,
  delivered: 3,
  failed: 99,
  undeliverable: 99,
};

/**
 * The state a Pingen webhook moves a sending to, or `undefined` if the event is history only.
 * Never moves backwards. `failed` and `undeliverable` are terminal, `undeliverable` may follow `sent`.
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
      target = rejected ? 'failed' : undefined;
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
