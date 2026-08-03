import type { FeatureBlock, FeatureRollout } from '@okr/tenant-util';
import { effectiveFeatures } from '@okr/tenant-util';

/**
 * Which blocks directly depend on `id`? Used to warn before an unpick, naming exactly what
 * would break — the user decides, not the picker, whether to cascade further.
 *
 * Direct dependents only, by design and by the spec in `feature-picker.util.spec.ts`: for
 * `person ← calevent, finance ← esign`, `dependentsOf(catalogue, 'person')` is
 * `['calevent', 'finance']`, NOT `['calevent', 'finance', 'esign']` — the brief's own
 * reference implementation (a `dependsOn` fixed-point closure) computes the full transitive
 * set instead and fails that exact case; verified by running the test before trusting it.
 * A cascading uncheck (person → finance → esign) is the caller's job, one direct hop at a
 * time, so each hop gets its own confirmation naming only what breaks at that hop — see
 * `transitiveDependentsOf` below for the whole-chain version the picker actually uses.
 */
export function dependentsOf(catalogue: FeatureBlock[], id: string): string[] {
  return catalogue.filter(block => block.dependsOn.includes(id)).map(block => block.id);
}

/**
 * Every currently-SELECTED block that would break, transitively, if `id` were switched off.
 * `dependentsOf` itself only returns direct dependents — this walks the chain (BFS over
 * repeated `dependentsOf` calls) so the picker can show ONE confirmation for the whole
 * cascade instead of one dialog per hop, restricted to blocks the admin actually has ticked
 * (an already-unticked dependent needs no warning).
 */
export function transitiveDependentsOf(
  catalogue: FeatureBlock[], id: string, selected: ReadonlySet<string> | Iterable<string>,
): string[] {
  const selectedSet = selected instanceof Set ? selected : new Set(selected);
  const out = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dep of dependentsOf(catalogue, current)) {
      if (selectedSet.has(dep) && !out.has(dep)) {
        out.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...out];
}

/**
 * Which blocks would lose their menu entries if `nextEnabled` were saved right now? The whole
 * point of the removal-confirmation dialog (spec Task 11) — computed with a SINGLE `rollouts`
 * snapshot for both sides on purpose: `before`/`after` used to be derived from two independent
 * `toSignal` subscriptions to the same Firestore stream (the component's own vs.
 * `FeatureStore`'s), which can legitimately disagree for one render tick if one has a fresher
 * emission than the other — a `beta` block that's allow-listed for this tenant could then be
 * reported as "about to be removed" when it would not be. One snapshot in, both sides computed
 * from it, makes that class of mismatch impossible by construction.
 *
 * `currentEnabled` MUST be passed verbatim — `undefined` (D-BB-10: no rollout doc yet, every
 * non-internal block is on) is NOT the same as `[]` (explicitly nothing on). Coalescing it
 * before calling this function silently defeats the legacy-tenant safety net; `effectiveFeatures`
 * (imported, not reimplemented here) is the single place that interprets `undefined` correctly,
 * and this function relies on it doing so for BOTH sides in the same way `FeatureStore` does.
 */
export function blocksRemovedBySave(input: {
  catalogue: FeatureBlock[];
  rollouts: FeatureRollout[];
  /** app-config's field verbatim — `undefined` = legacy doc, D-BB-10. Never coalesce. */
  currentEnabled: string[] | undefined;
  nextEnabled: string[];
  tenantId: string;
}): string[] {
  const { catalogue, rollouts, currentEnabled, nextEnabled, tenantId } = input;
  const before = effectiveFeatures({ catalogue, rollouts, enabled: currentEnabled, tenantId });
  const after = effectiveFeatures({ catalogue, rollouts, enabled: nextEnabled, tenantId });
  return [...before].filter(id => !after.has(id));
}
