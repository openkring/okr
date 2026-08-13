// libs/pdf-template/data-access/src/lib/doc-email.service.ts
import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { ENV } from '@okr/shared-config';
import { chunkRecipients } from '@okr/shared-util-angular';

/** A user-picked file attached inline (base64) to the email. */
export interface InlineAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

/**
 * Mailgun accepts at most 1000 recipients per message; 500 leaves headroom and keeps a failed
 * block small. ~1.1 s between blocks stays under the per-second rate limit of every plan.
 */
const BCC_BLOCK_SIZE = 500;
const BLOCK_PAUSE_MS = 1100;

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
  /** Reports the send progress of a chunked bulk mail (1-based block index). */
  onProgress?: (block: number, blocks: number) => void;
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

  /**
   * Sends the mail. A large bcc list is split into blocks that go out sequentially with a pause in
   * between. `cc` rides along with the first block only; `to` is repeated on every block — a message
   * without a `To:` header is treated as spam by most receivers, and the CF requires one. The
   * consequence is that the `to` address (the org's own) receives one copy per block.
   *
   * A failing block aborts the loop and rethrows — the caller must report how many blocks were
   * already sent rather than pretend the send succeeded.
   *
   * ponytail: client-side loop, so the tab has to stay open and there is no resume after a failure.
   * Move to the Firestore job queue (idea 2.96) once lists exceed a few thousand recipients.
   */
  public async sendDocumentByEmail(req: SendDocumentByEmailRequest): Promise<void> {
    const callable = httpsCallable(this.functions, 'sendEmail');
    const attachments = [
      ...(req.storagePath ? [{ storagePath: req.storagePath, filename: req.filename }] : []),
      ...(req.extraAttachments ?? []),
    ];
    const blocks = chunkRecipients(req.bcc ?? [], BCC_BLOCK_SIZE);
    // No bcc at all is still one message — to/cc must go out.
    const count = Math.max(blocks.length, 1);

    for (let i = 0; i < count; i++) {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, BLOCK_PAUSE_MS));
      req.onProgress?.(i + 1, count);
      await callable({
        to: req.to,
        cc: i === 0 ? req.cc : [],
        bcc: blocks[i] ?? [],
        ...(req.from ? { from: req.from } : {}),
        subject: req.subject,
        html: req.html,
        provider: 'mailtrap_api',
        appId: this.env.appId,
        attachments,
      });
    }
  }
}
