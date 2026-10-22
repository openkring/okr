import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable, map } from 'rxjs';

import {
  FileTransferView, PrepareFileTransferUploadRequest, PrepareFileTransferUploadResponse,
  SendFileTransferRequest, SendFileTransferResponse,
} from '@okr/content-file-transfer-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  DbQuery, FileTransferCollection, FileTransferEventCollection, FileTransferEventModel, FileTransferModel,
} from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

export type FileTransferDisposition = 'inline' | 'attachment';

/**
 * Failure of a file-transfer call. `code` is the HttpsError code without the `functions/` prefix
 * (callables) or the public API error code (`not_found`, `gone`, `rate_limited`, …); `status` is set
 * for the public API only.
 */
export class FileTransferError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'FileTransferError';
  }
}

/** How a failed `getFileTransfer` / `openFileTransferFile` call reads to a member. */
export type FileTransferFailure = 'expired' | 'notFound' | 'other';

/**
 * Classifies a failed callable by the reason the server named in its HttpsError message: the
 * transfer ran out (`expired`), or it does not exist / is not the caller's (`notFound` — the server
 * never answers 403, so nothing leaks). Unwraps an rxResource error's `cause`. One mapping for the
 * view page and the chat card.
 */
export function fileTransferFailureOf(error: unknown): FileTransferFailure {
  const cause = (error as { cause?: unknown } | null)?.cause ?? error;
  const message = cause instanceof FileTransferError ? cause.message : '';
  return message === 'expired' || message === 'notFound' ? message : 'other';
}

const GENERIC_FAILURE = 'Die Dateiübertragung ist fehlgeschlagen. Bitte versuche es später noch einmal.';

/** Same mapping as AliasMintService.toFailure, but thrown as a typed error. */
function toFailure(error: unknown): FileTransferError {
  const raw = error as { code?: unknown; message?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code.replace(/^functions\//, '') : 'unknown';
  const message = typeof raw?.message === 'string' && raw.message.trim() !== '' ? raw.message : GENERIC_FAILURE;
  return new FileTransferError(code, message);
}

const byDesc = <T>(field: keyof T) => (a: T, b: T): number =>
  String(b[field] ?? '').localeCompare(String(a[field] ?? ''));

/**
 * Client of the quick file-transfer feature (spec 1.115): callables for the sender, Firestore lists
 * (rules: only the sender or an admin may read), and the unauthenticated public link API.
 * Lists are sorted in code (no orderBy → no composite indexes).
 */
@Injectable({ providedIn: 'root' })
export class FileTransferService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');
  private readonly tenantId = this.env.tenantId;

  /** Public API base, derived from the project id exactly like PublicGalleryService. */
  private readonly publicBase =
    `https://europe-west6-${this.env.firebase.projectId}.cloudfunctions.net/publicApi/public/api/v1/file-transfer`;

  /*-------------------------- callables --------------------------------*/
  public prepare(req: PrepareFileTransferUploadRequest): Promise<PrepareFileTransferUploadResponse> {
    return this.call('prepareFileTransferUpload', req);
  }

  public send(req: SendFileTransferRequest): Promise<SendFileTransferResponse> {
    return this.call('sendFileTransfer', req);
  }

  public get(transferKey: string): Promise<FileTransferView> {
    return this.call('getFileTransfer', { transferKey });
  }

  public async openFile(transferKey: string, fileIndex: number, disposition: FileTransferDisposition): Promise<string> {
    const res = await this.call<{ url: string }>('openFileTransferFile', { transferKey, fileIndex, disposition });
    return res.url;
  }

  public async end(transferKey: string): Promise<void> {
    await this.call('endFileTransfer', { transferKey });
  }

  public async requestLimit(reason: string): Promise<void> {
    await this.call('requestFileTransferLimit', { reason });
  }

  private async call<T>(name: string, payload: unknown): Promise<T> {
    try {
      const result = await httpsCallable<unknown, T>(this.functions, name)(payload);
      return result.data;
    } catch (error) {
      console.warn(`FileTransferService.${name} failed`, (error as { code?: string })?.code ?? 'unknown');
      throw toFailure(error);
    }
  }

  /*-------------------------- Firestore lists --------------------------------*/
  /** The sender's own transfers (rules require senderKey == own personKey). Newest first. */
  public listMine(personKey: string): Observable<FileTransferModel[]> {
    const query: DbQuery[] = [...getSystemQuery(this.tenantId), { key: 'senderKey', operator: '==', value: personKey }];
    return this.firestoreService.searchData<FileTransferModel>(FileTransferCollection, query, 'none')
      .pipe(map(list => [...list].sort(byDesc<FileTransferModel>('createdAt'))));
  }

  /** All transfers of the tenant. Admin only (rules). Newest first. */
  public listAll(): Observable<FileTransferModel[]> {
    return this.firestoreService.searchData<FileTransferModel>(FileTransferCollection, getSystemQuery(this.tenantId), 'none')
      .pipe(map(list => [...list].sort(byDesc<FileTransferModel>('createdAt'))));
  }

  /**
   * Access log of one transfer, newest first. Admins may omit `senderKey`; a non-admin MUST pass
   * their own personKey, otherwise the query is not provably within the rules and is denied.
   */
  public listEvents(transferKey: string, senderKey?: string): Observable<FileTransferEventModel[]> {
    const query: DbQuery[] = [
      { key: 'tenants', operator: 'array-contains', value: this.tenantId },
      { key: 'transferKey', operator: '==', value: transferKey },
    ];
    if (senderKey) query.push({ key: 'senderKey', operator: '==', value: senderKey });
    return this.firestoreService.searchData<FileTransferEventModel>(FileTransferEventCollection, query, 'none')
      .pipe(map(list => [...list].sort(byDesc<FileTransferEventModel>('at'))));
  }

  /**
   * Every access-log event of the sender's own transfers, in ONE listener (the list's open/download
   * counts). Rules admit it because the query pins `senderKey` to the caller's own personKey.
   */
  public listEventsOfSender(senderKey: string): Observable<FileTransferEventModel[]> {
    const query: DbQuery[] = [
      { key: 'tenants', operator: 'array-contains', value: this.tenantId },
      { key: 'senderKey', operator: '==', value: senderKey },
    ];
    return this.firestoreService.searchData<FileTransferEventModel>(FileTransferEventCollection, query, 'none');
  }

  /**
   * One-shot read of one transfer's log (admin monitor: loaded per row on demand instead of one
   * listener per row). Throws on a denied/failed read rather than returning an empty log.
   */
  public async getEvents(transferKey: string, senderKey?: string): Promise<FileTransferEventModel[]> {
    const query: DbQuery[] = [
      { key: 'tenants', operator: 'array-contains', value: this.tenantId },
      { key: 'transferKey', operator: '==', value: transferKey },
    ];
    if (senderKey) query.push({ key: 'senderKey', operator: '==', value: senderKey });
    const list = await this.firestoreService.getDataOnceStrict<FileTransferEventModel>(FileTransferEventCollection, query, 'none');
    return [...list].sort(byDesc<FileTransferEventModel>('at'));
  }

  /*-------------------------- public link API (no auth) --------------------------------*/
  public async publicView(token: string): Promise<FileTransferView> {
    const res = await this.publicFetch(`${this.publicBase}/${encodeURIComponent(token)}`, { method: 'GET' });
    return res as FileTransferView;
  }

  public async publicFileUrl(
    token: string, fileIndex: number, disposition: FileTransferDisposition, password?: string,
  ): Promise<string> {
    const body: { fileIndex: number; disposition: FileTransferDisposition; password?: string } = { fileIndex, disposition };
    if (password) body.password = password;
    const res = await this.publicFetch(`${this.publicBase}/${encodeURIComponent(token)}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as { url: string };
    return res.url;
  }

  private async publicFetch(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new FileTransferError('network', GENERIC_FAILURE);
    }
    const json = await res.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined;
    if (!res.ok) {
      throw new FileTransferError(json?.error?.code ?? `http_${res.status}`, json?.error?.message ?? GENERIC_FAILURE, res.status);
    }
    return json;
  }
}
