import type { MenuStructureChange } from './menu-seed.util';

/**
 * What an `applyFeatureSelection` run WOULD do, computed by the same planners that do it.
 *
 * Returned on every call and, with `dryRun: true`, returned INSTEAD of writing — so the picker
 * can name the consequences of a save before committing to it. The alternative, predicting them
 * client-side, is what the root-menu warning used to do, and it is wrong in a way that is hard
 * to see: `MenuService.list()` is tenant-scoped, so the client cannot see a shared menu document
 * this tenant does not yet inherit and would report a `create` where the server plans an
 * `add-tenant`. The server reads the collection unscoped and is the only place the real answer
 * exists.
 *
 * Deliberately flat strings rather than the internal `MenuOp[]`: this crosses the callable
 * boundary into a confirmation dialog, and every field here is something a tenant admin can be
 * shown verbatim.
 */
export interface ApplyPlanPreview {
  /** Menu documents that do not exist yet and would be created, by `name`. */
  created: string[];
  /** Existing shared menu documents this tenant would be added to (`tenants[]`), by `name`. */
  extended: string[];
  /**
   * Catalogue-owned fields that would be overwritten on documents that already exist, with the
   * value each replaces. EMPTY unless the run asked for `replayStructure` — an ordinary save
   * cannot overwrite anything, which is the point of the split (D-BB-7b).
   */
  overwritten: MenuStructureChange[];
  /** Root-menu rows that would disappear from `main_<tenantId>`. */
  rootRemoved: string[];
  /** Root-menu rows that would be appended at the tail (`planRootMenuOp` never reorders). */
  rootAdded: string[];
  /** Seed documents that would be created because they are absent, as `collection/okey`. */
  seeded: string[];
  /** Block ids turning ON relative to what `enabledFeatures` holds right now. */
  enabling: string[];
  /** Block ids turning OFF relative to what `enabledFeatures` holds right now. */
  disabling: string[];
}

/** True when a plan would change nothing at all — nothing worth a confirmation dialog. */
export function isEmptyPlan(preview: ApplyPlanPreview): boolean {
  return preview.created.length === 0
    && preview.extended.length === 0
    && preview.overwritten.length === 0
    && preview.rootRemoved.length === 0
    && preview.rootAdded.length === 0
    && preview.seeded.length === 0
    && preview.enabling.length === 0
    && preview.disabling.length === 0;
}
