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
 * Two event families share the collection, discriminated by `op`:
 *  - `enable` / `disable` — a block transition for `tenantId`; `block` is the block id.
 *  - `menu-add` / `menu-structure` / `pin` / `unpin` / `catalogue-apply` — ONE menu
 *    document. `docId`/`name` say which; `field`/`from`/`to` carry the change where
 *    there is one (`menu-add` has none — it records that a row was attached).
 */
export interface FeatureEvent {
  okey: string;
  tenantId: string;
  block: string;
  op: 'enable' | 'disable' | 'menu-structure' | 'menu-add' | 'pin' | 'unpin' | 'catalogue-apply';
  at: string;
  by: string;
  /** Every document-scoped op — the real Firestore doc id written to. */
  docId?: string;
  /** Every document-scoped op — the `name` the app resolves that menu node by. */
  name?: string;
  /** `menu-structure` / `pin` / `unpin` / `catalogue-apply` — one of `STRUCTURAL_FIELDS`. */
  field?: string;
  /** `menu-structure` / `catalogue-apply` — the value the live document carried before. */
  from?: string;
  /** `menu-structure` / `catalogue-apply` — the value written. */
  to?: string;
}

export const FeatureEventCollection = 'featureEvents';
