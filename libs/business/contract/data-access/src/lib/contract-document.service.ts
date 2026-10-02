import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ContractDocState, ContractDocumentRef, ContractDocumentRole } from '@okr/shared-models';

export interface SignedContractDocument {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ContractDocumentService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /** Signed-PUT upload. The same `file.name` goes to both callables; the PUT sends `file.type` exactly as declared. */
  public async upload(
    contractKey: string,
    file: File,
    meta: { role: ContractDocumentRole; title: string; docState: ContractDocState; priorVersionKey?: string }
  ): Promise<ContractDocumentRef> {
    const req = httpsCallable<
      { contractKey: string; fileName: string; mimeType: string; size: number },
      { docKey: string; uploadUrl: string }
    >(this.functions, 'requestContractUpload');
    const { data } = await req({ contractKey, fileName: file.name, mimeType: file.type, size: file.size });
    const put = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    const reg = httpsCallable<unknown, { ref: ContractDocumentRef }>(this.functions, 'registerContractDocument');
    const res = await reg({ contractKey, docKey: data.docKey, fileName: file.name, ...meta });
    return res.data.ref;
  }

  public async sign(documentKeys: string[]): Promise<SignedContractDocument[]> {
    if (documentKeys.length === 0) return [];
    const fn = httpsCallable<{ documentKeys: string[] }, { documents: SignedContractDocument[] }>(
      this.functions,
      'signContractDocuments'
    );
    return (await fn({ documentKeys })).data.documents;
  }

  public async summarize(contractKey: string): Promise<{ abstract: string; suggestedTags: string[] }> {
    const fn = httpsCallable<{ contractKey: string }, { abstract: string; suggestedTags: string[] }>(
      this.functions,
      'summarizeContract'
    );
    return (await fn({ contractKey })).data;
  }
}
