import { DEFAULT_KEY } from '@okr/shared-constants';
import { OkrModel } from './base.model';

export class I18nTenantOverrideModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenantId = DEFAULT_KEY;
  public tenants: string[] = [];
  public module = DEFAULT_KEY;
  public key = DEFAULT_KEY;
  public de = DEFAULT_KEY;
  public en = DEFAULT_KEY;
  public fr = DEFAULT_KEY;
  public es = DEFAULT_KEY;
  public it = DEFAULT_KEY;
  public isHtml = false;
  public isArchived = false;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.tenants = [tenantId];
  }
}

export const I18nTenantOverrideCollection = 'i18nTenantOverride';
export const I18nTenantOverrideModelName = 'i18nTenantOverride';
