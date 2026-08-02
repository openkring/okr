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
