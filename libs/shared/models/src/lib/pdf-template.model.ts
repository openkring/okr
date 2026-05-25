export const TemplateCollection = 'templates';
export const TemplateVersionSubcollection = 'versions';
export const DocGenerationCollection = 'docGenerations';

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type TemplateOutputFormat = 'pdf' | 'docx' | 'html';
export type TemplateCategory = 'invoice' | 'expense' | 'report' | 'dunning' | 'other';
export type TemplateLanguage = 'de' | 'fr' | 'it' | 'en';

export interface TemplateAssetRef {
  key: string;
  storagePath: string;
  mimeType: string;
}

export class TemplateModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  public name = '';
  public description = '';
  public category: TemplateCategory = 'other';
  public language: TemplateLanguage = 'de';
  public currentVersion = 0;
  public draftVersion: number | undefined = undefined;
  public status: TemplateStatus = 'draft';
  public defaultOutputFormat: TemplateOutputFormat = 'pdf';
  public defaultFormat = 'A4';
  public defaultOrientation: 'portrait' | 'landscape' = 'portrait';
  public sampleData = '{}';   // JSON string
  public payloadSchema = '';  // JSON schema string (optional)

  public createdAt = '';
  public createdBy = '';
  public updatedAt = '';
  public updatedBy = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export class TemplateVersionModel {
  public bkey = '';  // string representation of version number

  public version = 1;
  public html = '';
  public css = '';
  public partials: Record<string, string> = {};
  public assets: TemplateAssetRef[] = [];
  public status: TemplateStatus = 'draft';
  public changelog = '';
  public publishedAt = '';
  public publishedBy = '';
  public createdAt = '';
  public createdBy = '';
}

export class DocGenerationModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';

  public userId = '';
  public templateId = '';
  public templateVersion = 0;
  public outputFormat: TemplateOutputFormat = 'pdf';
  public status: 'success' | 'failed' = 'success';
  public errorMessage = '';
  public storagePath = '';
  public filename = '';
  public sizeBytes = 0;
  public durationMs = 0;
  public entityType = '';
  public entityId = '';

  public createdAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
