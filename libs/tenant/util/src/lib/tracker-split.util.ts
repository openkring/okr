/**
 * ONE-OFF MIGRATION DECISION — the tracker split (owner decision 2026-11-26). Pure; the Firestore I/O lives in
 * `scripts/migrate-tracker-split.mjs`.
 *
 * Before the split, the `trip` block (Logbuch) also carried the tracker («Strecke aufzeichnen», `/tracker`). Owner
 * ruling: Strecken becomes its own free block `tracker`, and a tenant that had `trip` in `enabledFeatures` keeps
 * the tracker, so it gets `tracker` added. No paid option changes: the option `logbuch` stays `['trip']`.
 *
 * A tenant WITHOUT `enabledFeatures` (legacy «all non-internal blocks», D-BB-10) is untouched: `tracker` is `ga`,
 * so the legacy path already includes it.
 *
 * Idempotent: only a missing id is added, existing order is kept, a second run plans nothing.
 */

/** The block carved out of `trip`. */
export const TRACKER_SPLIT_BLOCK = 'tracker';

export interface TrackerSplitPlan {
  /** Block ids to add to `enabledFeatures` (empty = nothing to write). */
  addBlocks: string[];
  /** The full new `enabledFeatures`, set only when `addBlocks` is not empty. */
  enabledFeatures?: string[];
}

/** What the tracker split changes for one tenant, given its `app-config/{tenantId}.enabledFeatures`. */
export function planTrackerSplit(enabledFeatures: unknown): TrackerSplitPlan {
  if (!Array.isArray(enabledFeatures)) return { addBlocks: [] };
  const enabled = enabledFeatures.filter((v): v is string => typeof v === 'string');
  if (!enabled.includes('trip') || enabled.includes(TRACKER_SPLIT_BLOCK)) return { addBlocks: [] };
  return { addBlocks: [TRACKER_SPLIT_BLOCK], enabledFeatures: [...enabled, TRACKER_SPLIT_BLOCK] };
}
