import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** One sanitized address of a parent, visible at `registered` level (spec 1.19 §A4). */
export interface DirectoryEntry {
  addressOkey: string;
  addressChannel: string;       // contact channels only — never ssn/dob/bankaccount (floors)
  addressChannelLabel: string;
  addressUsage: number;
  addressUsageLabel: string;
  isFavorite: boolean;
  isCc: boolean;
  email: string;
  phone: string;
  streetName: string;
  streetNumber: string;
  addressValue2: string;
  zipCode: string;
  city: string;
  countryCode: string;
  url: string;
}

/**
 * Materialized, per-tenant projection of a parent's registered-visible addresses
 * (spec 1.19 Phase 4 §A4). Written ONLY by Cloud Functions (client rule: read
 * tenantRead, write false); doc id = getAddressDirectoryKey(tenantId, parentKey).
 */
export class AddressDirectoryModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public parentKey = DEFAULT_KEY;             // 'person.<okey>' | 'org.<okey>'
  public parentType: 'person' | 'org' = 'person';
  public favEmail = '';                       // favorite-entry conveniences for list rows
  public favPhone = '';
  public favZipCode = '';
  public entries: DirectoryEntry[] = [];
  public isArchived = false;
  public tenants: string[] = DEFAULT_TENANTS; // exactly [tenantId]
  public index = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AddressDirectoryCollection = 'address-directory';

export function getAddressDirectoryKey(tenantId: string, parentKey: string): string {
  return `${tenantId}_${parentKey}`;
}
