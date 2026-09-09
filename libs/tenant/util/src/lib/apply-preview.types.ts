import type { StructuralField } from './menu-ownership.util';

/**
 * What one `applyFeatureSelection` verb WOULD do, as sentences rather than operations.
 *
 * The previous shape was six string arrays of internal op names (`created`, `extended`,
 * `overwritten`, …) and every consumer had to turn them back into prose. A confirmation
 * dialog is the only consumer there is, so the plan is built in the form it is read in:
 * one entry per thing that happens, each carrying its own `consequence` and, where there
 * is one, the `reason` it happens at all (dependency closure, rollout withholding).
 *
 * Still computed by the same planners that do the writing, never predicted a second time
 * (D-BB-7c), and still returned by a real run as well as by `dryRun`.
 */
export type PlanEntryKind =
  | 'block-enabled'
  | 'block-disabled'
  | 'block-withheld'
  | 'menu-created'
  | 'menu-extended'
  | 'menu-reactivated'
  | 'menu-attached'
  | 'field-overwritten'
  | 'field-pinned'
  | 'field-unpinned'
  | 'seed-created';

/**
 * Which sentence a `PlanEntry` carries, as a stable identifier rather than the sentence itself.
 *
 * `kind` is deliberately NOT enough: `menu-extended` reads differently depending on whether the
 * tenant was added to a shared document or a parent gained children, and `field-pinned` /
 * `field-unpinned` are one `kind` apart but two opposite promises. So the planner names the
 * sentence, and the client resolves it — see `planConsequence` in `feature-picker-i18n.ts`.
 */
export type PlanConsequence =
  | 'block_enabled'
  | 'block_enabled_dependency'
  | 'block_withheld'
  | 'block_disabled'
  | 'menu_created'
  | 'menu_shared'
  | 'menu_children'
  | 'menu_reactivated'
  | 'menu_attached'
  | 'seed_created'
  | 'field_overwritten'
  | 'field_pinned'
  | 'field_unpinned';

export interface PlanEntry {
  kind: PlanEntryKind;
  /** What the entry is about — a block id, a menu `name`, or `collection/okey`. */
  subject: string;
  /** Why it happens at all. Set for dependency closure and for withheld blocks. */
  reason?: string;
  /**
   * One sentence-fragment naming the effect, already tenant-readable — **German only**, because
   * it is built server-side where there is no active language. Kept as the fallback for a client
   * that is newer than the deployed function's `consequenceKey`; prefer `consequenceKey`.
   */
  consequence: string;
  /**
   * The translatable form of `consequence`. Optional so a client stays correct against a function
   * revision that predates it (the app may ship before `deploy:functions` lands) — resolve it with
   * `planConsequence`, which falls back to `consequence`.
   */
  consequenceKey?: PlanConsequence;
  /** `field-*` entries only. */
  field?: StructuralField;
  from?: string;
  to?: string;
}

export interface ApplyPlanPreview {
  entries: PlanEntry[];
  /** Blocks pulled in by `dependsOn`, each with the block that required it. */
  alsoEnabled: { id: string; because: string }[];
  /** Blocks the rollout withheld — reported, never thrown. */
  withheld: { id: string; reason: string }[];
}

export function isEmptyPlan(preview: ApplyPlanPreview): boolean {
  return preview.entries.length === 0
    && preview.alsoEnabled.length === 0
    && preview.withheld.length === 0;
}

export function entriesOfKind(preview: ApplyPlanPreview, kind: PlanEntryKind): PlanEntry[] {
  return preview.entries.filter(e => e.kind === kind);
}
