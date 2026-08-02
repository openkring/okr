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

/** Append-only audit trail of enable/disable transitions — the usage trail billing needs. */
export interface FeatureEvent {
  okey: string;
  tenantId: string;
  block: string;
  op: 'enable' | 'disable';
  at: string;
  by: string;
}

export const FeatureEventCollection = 'featureEvents';
