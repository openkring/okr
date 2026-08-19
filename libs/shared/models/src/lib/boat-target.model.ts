import { DEFAULT_TENANTS } from '@okr/shared-constants';

/**
 * Target boat counts per year for the Bootseinteilung grid (rboat_usage × rboat_type).
 * One document per tenant, document id = tenantId (like app-config).
 *
 * `targets` is a flat map because the grid is a sparse cross product; the key is
 * `${year}|${usage}|${type}` (see boatTargetKey in @okr/resource-util).
 */
export class BoatTargetModel {
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public targets: Record<string, number> = {};

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BoatTargetCollection = 'boat-targets';
