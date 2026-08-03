import type { FeatureBlock } from '@okr/tenant-util';

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
 * time, so each hop gets its own confirmation naming only what breaks at that hop.
 */
export function dependentsOf(catalogue: FeatureBlock[], id: string): string[] {
  return catalogue.filter(block => block.dependsOn.includes(id)).map(block => block.id);
}
