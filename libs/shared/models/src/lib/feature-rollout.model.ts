import { DEFAULT_KEY } from '@okr/shared-constants';

export type FeatureAvailability = 'ga' | 'beta' | 'internal' | 'disabled';

/** `feature-rollout/{blockId}` — operator-owned, one doc per catalogue block. */
export class FeatureRolloutModel {
  public okey = DEFAULT_KEY;          // == the catalogue block id
  public availability: FeatureAvailability = 'ga';
  public allowTenants: string[] = []; // relevant for 'beta' / 'internal'
  public denyTenants: string[] = [];  // hard exclusion, wins over everything
  public reason = '';                 // shown to a tenant when the block is withheld
  public updatedAt = '';
  public updatedBy = '';
}

export const FeatureRolloutCollection = 'feature-rollout';
export const FeatureRolloutModelName = 'featureRollout';

/**
 * Append-only audit trail — the usage trail billing needs, plus the record of what the
 * catalogue rewrote.
 *
 * Two event shapes share the collection, discriminated by `op`:
 *  - `enable` / `disable` — a block transition for `tenantId`. `block` is the block id.
 *  - `menu-structure` — ONE catalogue-owned field of ONE `menuItems` document overwritten
 *    by a `replayStructure` run («Struktur übernehmen»). `block` is the block whose spec
 *    produced the write; the five optional fields below carry the rest and are absent on
 *    the two transition shapes.
 */
export interface FeatureEvent {
  okey: string;
  tenantId: string;
  block: string;
  op: 'enable' | 'disable' | 'menu-structure';
  at: string;
  by: string;
  /** `menu-structure` only — the real Firestore doc id written to. */
  docId?: string;
  /** `menu-structure` only — the `name` the app resolves that menu node by. */
  name?: string;
  /** `menu-structure` only — one of `STRUCTURAL_FIELDS`: url | action | roleNeeded. */
  field?: string;
  /** `menu-structure` only — the value the live document carried before the run. */
  from?: string;
  /** `menu-structure` only — the catalogue value written. */
  to?: string;
}

export const FeatureEventCollection = 'featureEvents';
