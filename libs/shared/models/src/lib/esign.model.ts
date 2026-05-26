import type { Timestamp } from 'firebase/firestore';

export type EsignDocumentStatus =
  | 'uploading' | 'draft' | 'in-progress'
  | 'signed' | 'withdrawn' | 'rejected' | 'error';

export type EsignSignStatus =
  | 'on-hold' | 'pending' | 'in-progress' | 'signed' | 'rejected';

export interface EsignSignee {
  signeeId: string;
  email: string;
  name?: string;
  signOrder: number;
  signStatus: EsignSignStatus;
  viewedTime?: Timestamp;
  signedTime?: Timestamp;
  completionTime?: Timestamp;
  signeeComment?: string;
}

export interface EsignEvent {
  type: 'created' | 'started' | 'signee-viewed' | 'signee-signed'
      | 'signee-rejected' | 'completed' | 'withdrawn' | 'error';
  at: Timestamp;
  signeeId?: string;
  payload?: Record<string, unknown>;
}

export interface EsignRecord {
  esignId: string;
  tenantId: string;
  ownerUserId: string;
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
  documentName: string;
  storagePath: string;
  signedPdfPath?: string;
  deepsignDocumentId: string;
  documentStatus: EsignDocumentStatus;
  signStatus?: EsignSignStatus;
  signatureMode: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction: 'zertes' | 'eidas';
  comment?: string;
  initiatorAliasName: string;
  signees: EsignSignee[];
  events: EsignEvent[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completionTime?: Timestamp;
  errorMessage?: string;
}

export const EsignCollection = 'esignList';
export const EsignAuditCollection = 'esignAudit';
