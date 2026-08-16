// libs/content/pdf-template/data-access/src/lib/doc-email.service.ts
import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';

/** A user-picked file attached inline (base64) to the email. */
export interface InlineAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

/** Queue of server-side bulk sends, performed by the `onMailJob` Cloud Function (spec 2.96 §7). */
export const MailJobCollection = 'mailJobs';

/** The job document as this client cares about it — the send state written back by the function. */
export interface MailJobStatus {
  state?: 'pending' | 'sending' | 'sent' | 'failed';
  blocksSent?: number;
  blocksTotal?: number;
  error?: string;
}

export interface SendDocumentByEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  /** Optional sender; when omitted the CF uses the app's verified sender address. */
  from?: string;
  subject: string;
  html: string;
  /** Storage path of the generated document to attach (resolved server-side). */
  storagePath: string;
  /** Filename to use for the attachment. */
  filename: string;
  /** Additional user-picked files attached inline. */
  extraAttachments?: InlineAttachment[];
  /** Tenant the job belongs to — required for a queued bulk send. */
  tenantId?: string;
}

/**
 * Sends a generated document by email via the existing `sendEmail` Cloud Function.
 * The PDF is referenced by its Storage path; the function downloads and attaches it.
 */
@Injectable({ providedIn: 'root' })
export class DocEmailService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  /**
   * Sends a single mail (no bcc list) straight through the `sendEmail` callable, so the caller
   * gets the provider error synchronously. Bulk sends go through `queueBulkEmail` instead.
   */
  public async sendDocumentByEmail(req: SendDocumentByEmailRequest): Promise<void> {
    const callable = httpsCallable(this.functions, 'sendEmail');
    await callable({
      to: req.to,
      cc: req.cc ?? [],
      bcc: req.bcc ?? [],
      ...(req.from ? { from: req.from } : {}),
      subject: req.subject,
      html: req.html,
      provider: 'mailtrap_api',
      appId: this.env.appId,
      attachments: this.attachmentRefs(req),
    });
  }

  /**
   * Queues a bulk send: one job document, performed block by block by the `onMailJob` trigger.
   * The browser tab may be closed the moment this resolves — watch `mailJob(key)` for progress.
   *
   * @returns the job document key, or undefined when the write failed
   */
  public async queueBulkEmail(req: SendDocumentByEmailRequest): Promise<string | undefined> {
    return this.firestoreService.createObject(MailJobCollection, '', {
      tenants: [req.tenantId ?? this.env.tenantId],
      to: req.to,
      cc: req.cc ?? [],
      bcc: req.bcc ?? [],
      ...(req.from ? { from: req.from } : {}),
      subject: req.subject,
      html: req.html,
      attachments: this.attachmentRefs(req),
      state: 'pending',
    });
  }

  /** Live state of a queued bulk send. */
  public mailJob(key: string | undefined): Observable<MailJobStatus | undefined> {
    return this.firestoreService.readObject<MailJobStatus>(MailJobCollection, key);
  }

  /** The generated document (if any) plus the user-picked files, in the CF's reference format. */
  private attachmentRefs(req: SendDocumentByEmailRequest) {
    return [
      ...(req.storagePath ? [{ storagePath: req.storagePath, filename: req.filename }] : []),
      ...(req.extraAttachments ?? []),
    ];
  }
}
