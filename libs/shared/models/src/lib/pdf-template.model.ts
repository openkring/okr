import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';

export const TemplateCollection = 'templates';
export const TemplateVersionSubcollection = 'versions';
export const DocGenerationCollection = 'docGenerations';

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type TemplateOutputFormat = 'pdf' | 'docx' | 'html';
export type TemplateCategory = 'invoice' | 'expense' | 'report' | 'dunning' | 'contract' | 'confirmation' | 'other';
export type TemplateLanguage = 'de' | 'fr' | 'it' | 'en';
/**
 * What a template document is for. 'pdf' is the original kind (invoices, reports, ...);
 * 'emailLayout' wraps a mail body (header/footer); 'emailText' is the text of one mail.
 * Legacy docs have no `kind`: every reader coalesces with `kind ?? 'pdf'`.
 */
export type TemplateKind = 'pdf' | 'emailLayout' | 'emailText';
/** Which email layout a send uses. */
export type EmailLayoutChoice = 'standard' | 'plain';
/** The layouts a sender can choose; the server treats anything but `plain` as `standard`. */
export const LAYOUT_CHOICES: readonly EmailLayoutChoice[] = ['standard', 'plain'];
export type DocGenerationStatus = 'success' | 'failed';
/** Which side of the window envelope shows the recipient address; 'none' = no envelope. */
export type TemplateAddressWindow = 'none' | 'left' | 'right';

/** Template document ids of the email templates the renderer looks up. */
export const EmailLayoutKey = 'email-layout';
export const EmailPlainLayoutKey = 'email-layout-plain';
export const EmailTextPasswordResetKey = 'email-text-password-reset';

export interface TemplateAssetRef {
  key: string;
  storagePath: string;
  mimeType: string;
}

export class TemplateModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public name = DEFAULT_NAME;
  public description = DEFAULT_NOTES;
  public kind: TemplateKind = 'pdf';  // legacy docs lack it: read as `kind ?? 'pdf'`
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
  public payeeOrgId = '';            // org whose IBAN/address is the payee/sender; '' = tenant's default org
  public addressWindow: TemplateAddressWindow = 'none'; // envelope window; the editor preview outlines it on page 1

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
  public okey = DEFAULT_KEY;  // string representation of version number

  public version = 1;
  public html = '';
  public css = '';
  public subject = '';  // email kinds only; legacy versions lack it
  public text = '';     // email kinds only: plain-text half; legacy versions lack it
  public partials: Record<string, string> = {};
  public assets: TemplateAssetRef[] = [];
  public status: TemplateStatus = 'draft';
  public changelog = '';
  public publishedAt = '';
  public publishedBy = '';
  public createdAt = '';
  public createdBy = '';
}

export class DocGenerationModel implements OkrModel {
  public okey = DEFAULT_KEY;
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
