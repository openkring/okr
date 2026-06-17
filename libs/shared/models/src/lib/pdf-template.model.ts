import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel } from './base.model';

export const TemplateCollection = 'templates';
export const TemplateVersionSubcollection = 'versions';
export const DocGenerationCollection = 'docGenerations';

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type TemplateOutputFormat = 'pdf' | 'docx' | 'html';
export type TemplateCategory = 'invoice' | 'expense' | 'report' | 'dunning' | 'other';
export type TemplateLanguage = 'de' | 'fr' | 'it' | 'en';
export type DocGenerationStatus = 'success' | 'failed';

export interface TemplateAssetRef {
  key: string;
  storagePath: string;
  mimeType: string;
}

export class TemplateModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public name = DEFAULT_NAME;
  public description = DEFAULT_NOTES;
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
  public attachQrSlip = false;       // append a QR payment slip as a second page
  public qrSlipWithAmount = false;   // fill the slip amount from payload.amount

  public createdAt = '';
  public createdBy = '';
  public updatedAt = '';
  public updatedBy = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

/** Immutable content snapshot of one template version stored as a subcollection document. */
export class TemplateVersionModel {
  public bkey = DEFAULT_KEY;  // string representation of version number

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

export class DocGenerationModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public userId = '';
  public templateId = '';
  public templateVersion = 0;
  public outputFormat: TemplateOutputFormat = 'pdf';
  public status: DocGenerationStatus = 'success';
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
