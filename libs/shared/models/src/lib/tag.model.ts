import { DEFAULT_NAME, DEFAULT_TAGS, DEFAULT_TENANTS } from "@bk2/shared-constants";

export class TagModel {
  public tagModel = DEFAULT_NAME;
  public isArchived = false;
  public tenants = DEFAULT_TENANTS;
  public tags = DEFAULT_TAGS;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TagCollection = 'tags';
