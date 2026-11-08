// libs/content/pdf-template/data-access/src/lib/doc-email.service.ts
import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import type { EmailLayoutChoice } from '@okr/shared-models';
import type { MailingRecipientChannels } from '@okr/shared-util-core';

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
  /** A personal send (answer links): class and status of the first failed mail, never its message. */
  errorCode?: string;
}

export interface SendDocumentByEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  /** Optional sender; when omitted the CF uses the app's verified sender address. */
  from?: string;
  subject: string;
  /** The message body (HTML from the editor); the server wraps it in `layout`. */
  body: string;
  layout: EmailLayoutChoice;
  /** Storage path of the generated document to attach (resolved server-side). */
  storagePath: string;
  /** Filename to use for the attachment. */
  filename: string;
  /** What the mail names as «Beilage»; without it, `filename`. */
  attachmentName?: string;
  /** Additional user-picked files attached inline. */
  extraAttachments?: InlineAttachment[];
  /** Tenant the job belongs to — required for a queued bulk send. */
  tenantId?: string;
}

/** A Versand as `sendMailing` takes it (spec 1.145 §10): the content plus who gets it on which delivery type. */
export interface SendMailingRequest {
  tenantId: string;
  /** a group admin's Versand: the server checks the recipients against this group */
  groupKey?: string;
  subject: string;
  body: string;
  layout: EmailLayoutChoice;
  from?: string;
  to: string[];
  cc: string[];
  storagePath?: string;
  filename?: string;
  extraAttachments: InlineAttachment[];
  deliveries: { personKey: string; channels: string[] }[];
  /** events whose personal answer link the server mails to every E-Mail recipient; never with groupKey */
  caleventKeys?: string[];
}

/** The state of a Versand's letters, as `getMailingLetters` reports it. */
export interface MailingLetters {
  state: 'none' | 'pending' | 'ready' | 'failed' | 'expired';
  url?: string;
  count?: number;
  /** Post recipients without a postal address, left out */
  missing?: number;
}

/** What the `renderEmailPreview` callable gets for a composer body. */
export interface RenderPreviewRequest {
  body: string;
  layout: EmailLayoutChoice;
  attachmentName?: string;
  /** the events of a Versand with answer links, to show the link block in the preview */
  answerEvents?: { name: string; when: string }[];
}

/** A mail as the server renders it: the composer's message, or a template version with sample data. */
export interface RenderedPreview {
  subject: string;
  html: string;
  text: string;
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
      ...this.contentFields(req),
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
      ...this.contentFields(req),
      attachments: this.attachmentRefs(req),
      state: 'pending',
    });
  }

  /** Live state of a queued bulk send. */
  public mailJob(key: string | undefined): Observable<MailJobStatus | undefined> {
    return this.firestoreService.readObject<MailJobStatus>(MailJobCollection, key);
  }

  /**
   * The mail as the server will render it (same renderer as the send), for the composer's preview.
   * Rejects when the server cannot render it; the caller decides what to tell the user.
   */
  public async renderPreview(req: RenderPreviewRequest): Promise<RenderedPreview> {
    const callable = httpsCallable<RenderPreviewRequest & { appId: string }, RenderedPreview>(
      this.functions, 'renderEmailPreview');
    const { data } = await callable({
      appId: this.env.appId,
      body: req.body,
      layout: req.layout,
      ...(req.attachmentName ? { attachmentName: req.attachmentName } : {}),
      ...(req.answerEvents?.length ? { answerEvents: req.answerEvents } : {}),
    });
    return data;
  }

  /**
   * A saved version of an email template, rendered by the server with the template's sample data.
   * The renderer reads the version from Firestore, so it must be saved before this is called.
   * Rejects when the server cannot render it; the caller decides what to tell the user.
   */
  public async renderTemplatePreview(templateKey: string, version: number): Promise<RenderedPreview> {
    const callable = httpsCallable<{ appId: string; templateKey: string; version: number }, RenderedPreview>(
      this.functions, 'renderEmailPreview');
    const { data } = await callable({ appId: this.env.appId, templateKey, version });
    return data;
  }

  /**
   * The Zustellung table of a Versand (spec 1.145 §5): per person, the possible delivery types and the
   * profile's choice. A group admin passes `groupKey` and only learns about the group's members.
   */
  public async getMailingRecipients(tenantId: string, personKeys: string[], groupKey?: string): Promise<MailingRecipientChannels[]> {
    const callable = httpsCallable<{ tenantId: string; personKeys: string[]; groupKey?: string }, { recipients: MailingRecipientChannels[] }>(
      this.functions, 'getMailingRecipients');
    const { data } = await callable({ tenantId, personKeys, ...(groupKey ? { groupKey } : {}) });
    return data.recipients;
  }

  /**
   * Starts a Versand. The server checks the sender, stores the files and fans the send out by delivery
   * type; the tab may close as soon as this resolves. Rejects with the server's message on a refusal.
   */
  public async sendMailing(req: SendMailingRequest): Promise<string> {
    const callable = httpsCallable<SendMailingRequest, { mailingKey: string }>(this.functions, 'sendMailing');
    const { data } = await callable(req);
    return data.mailingKey;
  }

  /**
   * The Post part of a Versand (spec 1.145 P3): `pending` while the server builds the letters, `ready`
   * with a 10-minute download URL, or `failed` / `expired` / `none`.
   */
  public async getMailingLetters(mailingKey: string): Promise<MailingLetters> {
    const callable = httpsCallable<{ mailingKey: string }, MailingLetters>(this.functions, 'getMailingLetters');
    const { data } = await callable({ mailingKey });
    return data;
  }

  /** The three content fields every send path hands to the server, which composes the final mail. */
  private contentFields(req: SendDocumentByEmailRequest) {
    const attachmentName = req.attachmentName || req.filename;
    return {
      body: req.body,
      layout: req.layout,
      ...(attachmentName ? { attachmentName } : {}),
    };
  }

  /** The generated document (if any) plus the user-picked files, in the CF's reference format. */
  private attachmentRefs(req: SendDocumentByEmailRequest) {
    return [
      ...(req.storagePath ? [{ storagePath: req.storagePath, filename: req.filename }] : []),
      ...(req.extraAttachments ?? []),
    ];
  }
}
