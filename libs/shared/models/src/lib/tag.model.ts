export class TagModel {
  public tagModel = '';
  public isArchived = false;
  public tenants: string[] = [];
  public tags = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TagCollection = 'tags';