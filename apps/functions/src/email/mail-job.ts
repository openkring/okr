// apps/functions/src/email/mail-job.ts
//
// Server-side Serienmail send (spec ideas/2026-08-13-serienmail-ausbau-spec.md §6/§7).
//
// The composer used to run the block loop in the browser: the tab had to stay open and a failed
// block could not be resumed. Now the client writes ONE job document and this trigger performs the
// send, writing progress and the final state back onto the same document — which is also the status
// the composer displays, and (with the per-address events from `mailtrapWebhook`) the whole of §6.
//
// Deliberately no batch documents and no scheduler worker: one event-driven function has 540 s,
// which at 500 bcc per block and ~1.1 s between blocks covers far more recipients than any tenant
// list holds. ponytail: single-invocation loop; split into batch docs only if a list ever needs
// more than ~200'000 recipients or the send must survive a mid-run crash.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { getAppEmailConfig } from '../auth/email-templates';
import { sendEmailViaProvider } from '../auth/email-transport';
import { AttachmentRef, resolveAttachments } from '../auth';

const REGION = 'europe-west6';
const CF_NAME = 'onMailJob';

export const MailJobCollection = 'mailJobs';

/**
 * Mailtrap/Mailgun accept at most 1000 recipients per message; 500 leaves headroom and keeps a
 * failed block small. ~1.1 s between blocks stays under the per-second rate limit of every plan.
 */
const BCC_BLOCK_SIZE = 500;
const BLOCK_PAUSE_MS = 1100;

/** What the client writes. `state`/`blocks*`/`error` are owned by this function. */
export interface MailJobDoc {
  tenants: string[];
  to: string[];
  cc?: string[];
  bcc?: string[];
  from?: string;
  subject: string;
  html: string;
  attachments?: AttachmentRef[];
  state?: 'pending' | 'sending' | 'sent' | 'failed';
  blocksSent?: number;
  blocksTotal?: number;
  error?: string;
}

/** The tenant's configured provider, same lookup the workflow outbox uses. */
async function providerFor(tenantId: string): Promise<string> {
  const snap = await getFirestore().collection('app-config').doc(tenantId).get();
  return String(snap.data()?.['emailProvider'] ?? 'mailtrap_api');
}

/** `"Name" <a@b.ch>` → `a@b.ch`; a bare address passes through. */
export function bareAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
}

/**
 * Split the job into the envelopes that actually go out.
 *
 * A message without a `To:` header reads as spam, so every block needs one — but only the FIRST
 * block goes to the real `to`/`cc`; the rest are addressed to the sender, so the org's own mailbox
 * no longer receives one copy per block (the 4.65 §6 defect). No bcc at all is still one message.
 */
export function mailJobBlocks(job: MailJobDoc, from: string): { to: string[]; cc: string[]; bcc: string[] }[] {
  const bcc = job.bcc ?? [];
  const envelopes: { to: string[]; cc: string[]; bcc: string[] }[] = [];
  for (let i = 0; i < bcc.length; i += BCC_BLOCK_SIZE) {
    const first = i === 0;
    envelopes.push({
      to: first ? job.to : [bareAddress(from)],
      cc: first ? job.cc ?? [] : [],
      bcc: bcc.slice(i, i + BCC_BLOCK_SIZE),
    });
  }
  return envelopes.length > 0 ? envelopes : [{ to: job.to, cc: job.cc ?? [], bcc: [] }];
}

export const onMailJob = onDocumentCreated(
  {
    document: `${MailJobCollection}/{id}`,
    region: REGION,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const job = snap.data() as MailJobDoc;
    const tenantId = job.tenants?.[0] ?? '';

    let blocksTotal = 1;
    let sent = 0;
    try {
      const from = job.from || (await getAppEmailConfig(tenantId)).from;
      const provider = await providerFor(tenantId);
      const attachments = await resolveAttachments(job.attachments, CF_NAME);
      const blocks = mailJobBlocks(job, from);
      blocksTotal = blocks.length;
      await snap.ref.update({ state: 'sending', blocksTotal, blocksSent: 0 });

      for (const [i, block] of blocks.entries()) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, BLOCK_PAUSE_MS));
        await sendEmailViaProvider(provider, {
          from,
          ...block,
          subject: job.subject,
          html: job.html,
          attachments,
        });
        sent = i + 1;
        await snap.ref.update({ blocksSent: sent });
      }

      await snap.ref.update({ state: 'sent' });
      // Recipient COUNT, not addresses — PII (privacy inventory §7.2).
      logger.info(`${CF_NAME}: sent ${blocksTotal} block(s) to ${(job.bcc?.length ?? 0) + job.to.length} recipient(s) (tenant ${tenantId})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Not rethrown: a retry would re-send every block that already went out.
      logger.error(`${CF_NAME}: failed after ${sent}/${blocksTotal} block(s) (tenant ${tenantId}): ${message}`);
      await snap.ref.update({ state: 'failed', blocksSent: sent, blocksTotal, error: message });
    }
  },
);
