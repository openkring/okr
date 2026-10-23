import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable, map } from 'rxjs';

import { PublicLearningSection, roomDocs } from '@okr/content-learning-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { CommentCollection, CommentModel, DbQuery, DocumentCollection, DocumentModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import {
  CompleteLearningUploadRequest, DeleteLearningItemRequest, LearningUpload, PrepareLearningUploadRequest, SaveLearningItemRequest,
  chunk, joinCommentTexts, mergeUploadHeaders, publicRoomUrl, runLearningUpload, shapeSaveRequest, shapeUploadRequest, sortByTitle,
} from './learning-request';
import { uploadToSignedUrl } from './learning-upload';

/** Failure of a learning callable; `code` is the HttpsError code without the `functions/` prefix. */
export class LearningError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'LearningError';
  }
}

function toFailure(error: unknown): LearningError {
  const raw = error as { code?: unknown; message?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code.replace(/^functions\//, '') : 'unknown';
  const message = typeof raw?.message === 'string' && raw.message.trim() !== '' ? raw.message : 'Der Lernraum konnte nicht aktualisiert werden.';
  return new LearningError(code, message);
}

/** Learning rooms (spec 1.115): reads via Firestore, curator writes via callables, anonymous reads via the public API. */
@Injectable({ providedIn: 'root' })
export class LearningService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');
  private readonly tenantId = this.env.tenantId;

  /** Live documents of the room folder, by title. Filtered in code: no composite index needed. */
  public roomDocs(folderKey: string): Observable<DocumentModel[]> {
    return this.firestoreService
      .searchData<DocumentModel>(DocumentCollection, getSystemQuery(this.tenantId), 'none')
      .pipe(map(docs => sortByTitle(roomDocs(docs, folderKey))));
  }

  /** Comment text per document key (for search), read once. The tenant filter lets the list rule pass. */
  public async commentTexts(docKeys: string[]): Promise<Record<string, string>> {
    const keys = [...new Set(docKeys)];
    const all: CommentModel[] = [];
    for (const part of chunk(keys)) {
      const query: DbQuery[] = [
        { key: 'tenants', operator: 'array-contains', value: this.tenantId },
        { key: 'parentKey', operator: 'in', value: part.map(k => `document.${k}`) },
      ];
      all.push(...await this.firestoreService.getDataOnceStrict<CommentModel>(CommentCollection, query, 'none'));
    }
    return joinCommentTexts(all);
  }

  public async saveItem(req: SaveLearningItemRequest): Promise<void> {
    await this.call('saveLearningItem', shapeSaveRequest(req));
  }

  public prepareUpload(req: PrepareLearningUploadRequest): Promise<LearningUpload> {
    return this.call('prepareLearningUpload', req);
  }

  public async deleteItem(req: DeleteLearningItemRequest): Promise<void> {
    await this.call('deleteLearningItem', req);
  }

  public uploadToSignedUrl = uploadToSignedUrl;

  /** Confirms a finished PUT; the server verifies the object and sets `doc.url` (download token). */
  public completeUpload(req: CompleteLearningUploadRequest): Promise<{ url: string }> {
    return this.call('completeLearningUpload', req);
  }

  /**
   * Prepares, performs and completes an upload into a topic. If the PUT fails or is aborted, or the
   * completion is refused (object missing / wrong size), the half-created document is removed again
   * (best effort) and the original error is rethrown.
   * @returns the new document key
   */
  public async upload(
    pageKey: string, topic: string, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal,
  ): Promise<string> {
    return runLearningUpload({
      prepare: () => this.prepareUpload(shapeUploadRequest(pageKey, topic, file)),
      put: prepared => uploadToSignedUrl(prepared.uploadUrl, file, mergeUploadHeaders(prepared.headers, prepared.contentType), onProgress, signal),
      complete: docKey => this.completeUpload({ pageKey, docKey }),
      cleanup: docKey => this.deleteItem({ pageKey, docKey }),
    });
  }

  /** The published room as the public page API serves it (no auth). */
  public async publicRoom(pageKey: string): Promise<PublicLearningSection> {
    const url = publicRoomUrl(this.env.firebase.projectId, pageKey, this.tenantId);
    let res: Response;
    try { res = await fetch(url); } catch { throw new LearningError('network', 'Der Lernraum ist nicht erreichbar.'); }
    if (!res.ok) throw new LearningError(`http_${res.status}`, 'Der Lernraum ist nicht verfügbar.');
    const page = await res.json() as { sections?: Array<{ type?: string }> };
    const section = (page.sections ?? []).find(s => s?.type === 'learning');
    if (!section) throw new LearningError('not_found', 'Der Lernraum ist nicht verfügbar.');
    return section as PublicLearningSection;
  }

  private async call<T>(name: string, payload: unknown): Promise<T> {
    try {
      return (await httpsCallable<unknown, T>(this.functions, name)(payload)).data;
    } catch (error) {
      console.warn(`LearningService.${name} failed`, (error as { code?: string })?.code ?? 'unknown');
      throw toFailure(error);
    }
  }
}
