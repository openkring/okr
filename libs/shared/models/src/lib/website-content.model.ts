import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

export class WebsiteContentModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public key = DEFAULT_KEY;
  public de = DEFAULT_KEY;
  public en = DEFAULT_KEY;
  public isHtml = false;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WebsiteContentCollection = 'websiteContent';
export const WebsiteContentModelName = 'websiteContent';
