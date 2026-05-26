// libs/esign/data-access/src/lib/esign.service.ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import {
  EsignCollection,
  EsignRecord,
  EsignDocumentStatus,
} from '@bk2/shared-models';

export interface EsignSendDocumentRequest {
  storagePath: string;
  documentName?: string;
  initiatorAliasName: string;
  comment?: string;
  signatureMode?: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction?: 'zertes' | 'eidas';
  sendMail?: 'all' | 'others' | 'none';
  source: 'user-upload' | 'cf-generated';
  sourceRef?: string;
}

export interface EsignSendDocumentResponse {
  esignId: string;
  documentId: string;
  signees: EsignRecord['signees'];
}

export interface EsignScanPredefinedResponse {
  signatureFields: Array<{
    signFieldName: string;
    email: string;
    signOrder: number;
    signatureType: 'signature' | 'seal';
    autographPosition: { pageNumber: number; x: number; y: number; width: number; height: number };
  }>;
  observers: Array<{ email: string; isAdmin: boolean }>;
  signatureMode: string;
  jurisdiction: string;
}

@Injectable({ providedIn: 'root' })
export class EsignService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  public list(): Observable<EsignRecord[]> {
    return this.firestoreService.searchData<EsignRecord>(
      EsignCollection,
      [{ key: 'tenantId', operator: '==', value: this.env.tenantId }],
      'createdAt',
      'desc'
    );
  }

  public read(esignId: string): Observable<EsignRecord | undefined> {
    return this.firestoreService.readObject<EsignRecord>(EsignCollection, esignId);
  }

  public async uploadStagingPdf(file: File, tenantId: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const storagePath = `tenants/${tenantId}/esign/staging/${uuid}.pdf`;
    const storageRef = ref(getStorage(), storagePath);
    await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
    return storagePath;
  }

  public async scanPredefined(storagePath: string): Promise<EsignScanPredefinedResponse> {
    const fn = httpsCallable<{ storagePath: string }, EsignScanPredefinedResponse>(
      this.functions, 'esignScanPredefined'
    );
    const result = await fn({ storagePath });
    return result.data;
  }

  public async sendDocument(request: EsignSendDocumentRequest): Promise<EsignSendDocumentResponse> {
    const fn = httpsCallable<EsignSendDocumentRequest, EsignSendDocumentResponse>(
      this.functions, 'esignSendDocument'
    );
    const result = await fn(request);
    return result.data;
  }

  public async getDocumentDetails(esignId: string): Promise<Record<string, unknown>> {
    const fn = httpsCallable<{ esignId: string }, Record<string, unknown>>(
      this.functions, 'esignGetDocumentDetails'
    );
    const result = await fn({ esignId });
    return result.data;
  }

  public async resendInvitation(esignId: string, signeeId: string): Promise<void> {
    const fn = httpsCallable<{ esignId: string; signeeId: string }, void>(
      this.functions, 'esignResendInvitation'
    );
    await fn({ esignId, signeeId });
  }

  public async deleteEsign(esignId: string, reason?: string): Promise<void> {
    const fn = httpsCallable<{ esignId: string; reason?: string }, void>(
      this.functions, 'esignDelete'
    );
    await fn({ esignId, reason });
  }

  public async sendByEmail(params: {
    esignId: string;
    recipients: string[];
    subject?: string;
    body?: string;
    includeSignedPdf: boolean;
  }): Promise<void> {
    const fn = httpsCallable<typeof params, { success: boolean }>(
      this.functions, 'esignSendByEmail'
    );
    await fn(params);
  }

  public statusLabel(status: EsignDocumentStatus): string {
    const map: Record<EsignDocumentStatus, string> = {
      uploading: 'Uploading…',
      draft: 'Draft',
      'in-progress': 'In progress',
      signed: 'Signed',
      withdrawn: 'Withdrawn',
      rejected: 'Rejected',
      error: 'Error',
    };
    return map[status] ?? status;
  }

  public statusColor(status: EsignDocumentStatus): string {
    const map: Record<EsignDocumentStatus, string> = {
      uploading: 'primary',
      draft: 'medium',
      'in-progress': 'warning',
      signed: 'success',
      withdrawn: 'medium',
      rejected: 'danger',
      error: 'danger',
    };
    return map[status] ?? 'medium';
  }
}
