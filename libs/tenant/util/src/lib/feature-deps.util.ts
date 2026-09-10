import type { FeatureBlock } from './feature-catalogue.types';

/**
 * Expand a selection of block ids to include every transitive dependency.
 * Unknown ids are dropped (a stale `enabledFeatures` entry must not break the app).
 * Cycles terminate: a block already in the accumulator is never re-visited.
 */
export function resolveWithDeps(catalogue: FeatureBlock[], ids: string[]): string[] {
  const byId = new Map(catalogue.map(b => [b.id, b]));
  const out = new Set<string>();

  const visit = (id: string): void => {
    if (out.has(id)) return;
    const block = byId.get(id);
    if (!block) return;
    out.add(id);
    block.dependsOn.forEach(visit);
  };

  ids.forEach(visit);
  return [...out];
}

/**
 * Which of the currently ACTIVE blocks hold `blockId` on through their dependency closure?
 *
 * This is the question the picker and `disableBlock` both have to answer, and answering it
 * differently is what produced the dead end this function exists to close: the picker read a
 * block's state from `effectiveFeatures` (catalogue ∩ rollout ∩ enablement, DEPENDENCY-CLOSED),
 * while `planDisableBlock` wrote to the stored `enabledFeatures` array (NOT closed). Switching
 * `subject` off while `calevent` — which declares `dependsOn: ['subject', …]` — was on removed
 * the stored entry, `resolveWithDeps` immediately put it back into the effective set, and the
 * row kept offering «Ausschalten»: a second click found the id already gone from the stored
 * array and committed nothing, and «Einschalten» was never offered. Silent, unrecoverable
 * from inside the picker.
 *
 * `active` is the caller's notion of "running": the effective set client-side, stored +
 * `core` server-side. Blocks are compared through `resolveWithDeps`, so an indirect holder
 * (A → B → `blockId`) counts — it holds the block on just as firmly as a direct one.
 */
export function holdersOf(
  catalogue: FeatureBlock[], blockId: string, active: Iterable<string>,
): string[] {
  const out: string[] = [];
  for (const id of active) {
    if (id === blockId) continue;
    if (resolveWithDeps(catalogue, [id]).includes(blockId)) out.push(id);
  }
  return out;
}
