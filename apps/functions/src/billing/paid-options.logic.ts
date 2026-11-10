import { ADD_ON_PRICES } from '@okr/business-metering-util';

/** True for an id that is a paid option (an own key of ADD_ON_PRICES). */
export function isPaidOptionId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADD_ON_PRICES, id);
}

/**
 * Pure fence decision: the paid ids a request would newly ENABLE (in `requested`, not already in `current`)
 * that are not in `allowed` (subscription.options). Disabling is never listed.
 */
export function paidOptionChanges(current: string[], requested: string[], allowed: string[]): string[] {
  const have = new Set(current);
  const ok = new Set(allowed);
  return [...new Set(requested)].filter(id => isPaidOptionId(id) && !have.has(id) && !ok.has(id));
}
