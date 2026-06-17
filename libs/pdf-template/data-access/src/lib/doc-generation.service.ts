import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { ENV } from '@bk2/shared-config';

export interface GenerateDocumentRequest {
  templateId?: string;
  templateVersion?: number;
  payload?: Record<string, unknown>;
  html?: string;
  options?: {
    outputFormat?: 'pdf' | 'docx' | 'html';
    format?: 'A4' | 'A5' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
    filename?: string;
    storageMode?: 'persist' | 'ephemeral';
    metadata?: { entityType?: string; entityId?: string };
  };
}

export interface GenerateDocumentResponse {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  outputFormat: 'pdf' | 'docx' | 'html';
  generatedAt: string;
  templateVersion?: number;
  generationId: string;
}

@Injectable({ providedIn: 'root' })
export class DocGenerationService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    // Only route to the emulator when it is actually running (env flag), not for
    // every dev build — otherwise calls hang against a dead localhost:5001.
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async generate(req: GenerateDocumentRequest): Promise<GenerateDocumentResponse> {
    const callable = httpsCallable<GenerateDocumentRequest, GenerateDocumentResponse>(
      this.functions,
      'generateDocument'
    );
    const result = await callable(req);
    return result.data;
  }

  public async preview(
    templateId: string,
    payload: Record<string, unknown>,
    version?: number
  ): Promise<GenerateDocumentResponse> {
    return this.generate({
      templateId,
      templateVersion: version,
      payload,
      options: { storageMode: 'ephemeral' },
    });
  }

  public async printHtml(
    html: string,
    filename?: string,
    entityType?: string,
    entityId?: string
  ): Promise<GenerateDocumentResponse> {
    return this.generate({
      html,
      options: {
        storageMode: 'ephemeral',
        filename,
        metadata: entityType ? { entityType, entityId } : undefined,
      },
    });
  }
}
