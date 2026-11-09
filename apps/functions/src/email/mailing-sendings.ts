// apps/functions/src/email/mailing-sendings.ts
//
// The fan-out of a Pingen Versand (spec 1.150): turns exactly the CHARGED recipients (`post.recipients`) into
// one stored letter PDF + one queued `sendings` record each. A later trigger submits each record to Pingen.
//
// Idempotent by construction: the record id is `<mailingKey>_<recipientParentKey>` and is written with `create()`,
// so a re-run of the trigger creates only the missing ones. A charged recipient that ends without a record
// (address gone since the quote, now abroad, a failed build) gets its share of the deduction reversed.

import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { SendingCollection, type SendingModel } from '@okr/shared-models';
import { recipientParentKey } from '@okr/shared-util-core';
import { isSwissAddress } from '@okr/content-pdf-template-util';
import { privateBucket } from '../_storage/private-bucket';
import { getCreditPort } from '../pingen/credit-port';
import type { MailingPost } from '../pingen/post-order';
import { LETTERS_PREFIX, type RenderedLetter } from './mailing-letters';

export type SendingRecord = Omit<SendingModel, 'okey'>;

export interface PostFanOutDeps {
  savePdf(path: string, pdf: Buffer): Promise<void>;
  exists(id: string): Promise<boolean>;
  /** false = the record already exists (ALREADY_EXISTS) and was not touched */
  create(id: string, doc: SendingRecord): Promise<boolean>;
  reverseShare(tenantId: string, entryId: string, part: { units: number; pages: number }, key: string, reason: string): Promise<{ amount: number; duplicate: boolean }>;
}

export function sendingId(mailingKey: string, parentKey: string): string {
  return `${mailingKey}_${parentKey}`;
}

/** The object path of one letter's PDF; the sending's `storagePath` is exactly this (the reaper matches on it). */
export function sendingPdfPath(tenantId: string, mailingKey: string, parentKey: string): string {
  return `${LETTERS_PREFIX}${tenantId}/${mailingKey}/${parentKey}.pdf`;
}

export function makePostFanOut(args: { tenantId: string; mailingKey: string; post: MailingPost; nowIso: string; deps: PostFanOutDeps }) {
  const { tenantId, mailingKey, post, nowIso, deps } = args;
  const charged = new Set(post.recipients.map(recipientParentKey));
  // frozen at acceptance: never recomputed from today's prices
  const price = post.total / post.letters;
  const quotedPages = post.pages / post.letters;
  const handled = new Set<string>();

  const onLetter = async (l: RenderedLetter): Promise<void> => {
    const parentKey = recipientParentKey(l.recipientKey);
    if (!charged.has(parentKey) || !isSwissAddress(l.countryCode)) return;
    const id = sendingId(mailingKey, parentKey);
    if (!(await deps.exists(id))) {
      const storagePath = sendingPdfPath(tenantId, mailingKey, parentKey);
      if (l.pages !== quotedPages) {
        logger.warn(`mailing-sendings: Versand ${mailingKey}: rendered pages differ from the quote, charging the quoted price`, {
          mailingKey, recipient: parentKey, quotedPages, renderedPages: l.pages,
        });
      }
      await deps.savePdf(storagePath, l.pdf);
      await deps.create(id, {
        tenants: [tenantId], isArchived: false, channel: 'post', source: `mailing.${mailingKey}`, recipientKey: parentKey,
        recipientName: l.recipientName, storagePath, options: post.options, pages: l.pages, price, provider: 'pingen', providerId: '',
        state: 'queued', history: [{ state: 'queued', at: nowIso }], trackingNumber: '', createdAt: nowIso, updatedAt: nowIso,
      });
    }
    handled.add(parentKey);
  };

  /** Reverses the share of every charged recipient that has no record (after the build, whether it finished or failed). */
  const finish = async (reason = 'no letter was stored'): Promise<void> => {
    for (const parentKey of charged) {
      if (handled.has(parentKey)) continue;
      const id = sendingId(mailingKey, parentKey);
      try {
        if (await deps.exists(id)) continue;
      } catch { /* unknown: fall through to the reversal, which is idempotent by key */ }
      try {
        await deps.reverseShare(tenantId, post.creditEntryId, { units: 1, pages: quotedPages }, id, `Versand ${mailingKey}: ${reason}`);
      } catch (err) {
        // never fail the whole Versand for it: everything needed to reverse by hand is in the log
        logger.error(`mailing-sendings: reversal for Versand ${mailingKey} failed, reverse by hand`, {
          tenantId, mailingKey, recipient: parentKey, creditEntryId: post.creditEntryId, amount: price, pages: quotedPages, key: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  return { onLetter, finish, only: (l: RenderedLetter): boolean => !isSwissAddress(l.countryCode) };
}

/** The production wiring: private bucket, `sendings`, the credit port. */
export function postFanOutDeps(): PostFanOutDeps {
  const col = () => getFirestore().collection(SendingCollection);
  return {
    savePdf: async (path, pdf) => { await privateBucket().file(path).save(pdf, { contentType: 'application/pdf', resumable: false }); },
    exists: async (id) => (await col().doc(id).get()).exists,
    create: async (id, doc) => {
      try {
        await col().doc(id).create(doc);
        return true;
      } catch (err) {
        if ((err as { code?: number | string }).code === 6 || (err as { code?: string }).code === 'already-exists') return false;
        throw err;
      }
    },
    reverseShare: (tenantId, entryId, part, key, reason) => getCreditPort().reverseShare(tenantId, entryId, part, key, reason),
  };
}

/**
 * The `letters` state of the mailing after the build. A download Versand with no letter at all failed
 * (nobody has an address); a Pingen send with no abroad letter simply has nothing to download: 'none'
 * (a state the client already understands), never 'failed'.
 */
export function lettersResult(
  built: { storagePath: string; letters: number; missing: number } | undefined,
  postKeyCount: number,
  pingen: boolean,
): { state: 'none' | 'ready' | 'failed'; storagePath?: string; count?: number; missing?: number; error?: string } {
  if (built?.storagePath) return { state: 'ready', storagePath: built.storagePath, count: built.letters, missing: built.missing };
  const missing = built?.missing ?? postKeyCount;
  if (pingen) return { state: 'none', count: 0, missing };
  return { state: 'failed', count: 0, missing, error: 'No recipient has a postal address.' };
}
