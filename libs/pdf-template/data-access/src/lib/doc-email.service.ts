// libs/pdf-template/data-access/src/lib/doc-email.service.ts
import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { ENV } from '@bk2/shared-config';

/** A user-picked file attached inline (base64) to the email. */
export interface InlineAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
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
}

/**
 * Sends a generated document by email via the existing `sendEmail` Cloud Function.
 * The PDF is referenced by its Storage path; the function downloads and attaches it.
 */
@Injectable({ providedIn: 'root' })
export class DocEmailService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async sendDocumentByEmail(req: SendDocumentByEmailRequest): Promise<void> {
    const callable = httpsCallable(this.functions, 'sendEmail');
    await callable({
      to: req.to,
      cc: req.cc,
      bcc: req.bcc,
      ...(req.from ? { from: req.from } : {}),
      subject: req.subject,
      html: req.html,
      provider: 'mailtrap_api',
      appId: this.env.appId,
      attachments: [
        { storagePath: req.storagePath, filename: req.filename },
        ...(req.extraAttachments ?? []),
      ],
    });
  }
}
