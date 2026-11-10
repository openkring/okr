import { ADD_ON_BLOCKS, ADD_ON_PRICES } from '@okr/business-metering-util';

type BlockMap = Readonly<Record<string, readonly string[]>>;

/** True for an id that is a paid option (an own key of ADD_ON_PRICES). */
export function isPaidOptionId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADD_ON_PRICES, id);
}

/**
 * Pure fence decision over catalogue BLOCK ids: the paid options a request would newly enable (a block in
 * `requested`, not already in `current`, owned by an option via `map`) that are not in `allowed`
 * (subscription.options). Disabling is never listed.
 */
export function paidOptionChanges(
  current: string[], requested: string[], allowed: string[], map: BlockMap = ADD_ON_BLOCKS,
): string[] {
  const have = new Set(current);
  const ok = new Set(allowed);
  const added = new Set(requested.filter(b => !have.has(b)));
  return Object.keys(map).filter(option => !ok.has(option) && map[option].some(b => added.has(b)));
}
