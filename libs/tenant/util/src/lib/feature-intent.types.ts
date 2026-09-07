import type { StructuralField } from './menu-ownership.util';
import type { ApplyPlanPreview } from './apply-preview.types';

/**
 * ONE act per call (spec §19). The picker used to send a desired state — the set of ticked
 * blocks — and the callable reconciled the world against it, which is why a checkbox nobody
 * touched could remove a menu row. A verb says what the admin actually asked for, and
 * nothing else is derived from its absence.
 */
export type FeatureIntent =
  | { verb: 'enableBlock'; blockId: string; menuKeys: string[] }
  | { verb: 'disableBlock'; blockId: string }
  | { verb: 'addMenuRows'; keys: string[] }
  | { verb: 'applyCatalogueValue'; docId: string; field: StructuralField }
  | { verb: 'pinField'; docId: string; field: StructuralField }
  | { verb: 'unpinField'; docId: string; field: StructuralField };

export interface ApplyFeatureRequest {
  tenantId: string;
  intent: FeatureIntent;
  /** Plan everything, write nothing. The returned preview is what a real run would do. */
  dryRun?: boolean;
}

export interface ApplyFeatureResponse {
  preview: ApplyPlanPreview;
  /** `false` for a dry run, `true` when the writes were committed. */
  applied: boolean;
}
