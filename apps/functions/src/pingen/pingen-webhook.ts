// apps/functions/src/pingen/pingen-webhook.ts
//
// Pingen's letter webhooks on the shared receiver (_webhooks): each one moves the matching `sendings` record
// forward, never backwards (spec 1.150 §8). Pure core with injected deps (makePingenHandler); the production
// wiring is at the bottom.
//
// PAYLOAD, pinned 2026-11-09 from Pingen's OpenAPI (api.pingen.com/documentation, webhooks `misc.webhooks`).
// JSON:API document, one event per POST, authenticated by `Signature` = HMAC-SHA256 hex of the raw body:
//   data.type                              'webhook_issues' | 'webhook_sent' | 'webhook_undeliverable' | 'webhook_delivered'
//   data.relationships.deliverable.data    { id: <letter id = our providerId>, type: 'letters' | 'emails' | ... }
//   data.relationships.event.data.id       the event id (stable across Pingen's retries): our dedupe key
//   data.attributes.reason                 issues / undeliverable only: free text ("Content failed inspection")
//   data.attributes.corrected_address      undeliverable only: an address, NEVER stored here (personal data)
// The payload carries NO letter status and NO tracking number, and the schema does not say what makes an
// `issues` event final. Pingen does not publish a list of statuses or event codes either.
// RULING (rejection): an `issues` event rejects the letter only when its payload names a terminal failure status
// (attributes.status in TERMINAL_ISSUE_STATUSES). 'action_required' is recoverable (the sender can fix it in Pingen) and
// is NOT terminal. A payload without a status, which is every payload the schema documents, is history only:
// failing a letter refunds the sender's share, and a wrong refund of a letter Pingen still prints is worse than
// a letter that stays `submitted` with the reason in its history. Re-check against a real staging payload
// (`*_simulate_unprintable.pdf`) and extend the set if Pingen reports the status in the payload.

import { createHash } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { nextSendingState, type PingenCategory } from '@okr/content-pdf-template-util';
import { SendingCollection } from '@okr/shared-models';
import type { WebhookHandler } from '../_webhooks/process';
import type { WebhookClient } from '../_webhooks/types';
import { failSending, type FailDeps, type FailReason, type SendingRow, type SubmitDeps } from './submit-sending.logic';
import { sendingDeps } from './submit-sending';

// Signing key of the webhook (set in Pingen's organisation settings). Set with: firebase functions:secrets:set PINGEN_WEBHOOK_SIGNING_KEY
export const pingenWebhookSecret = defineSecret('PINGEN_WEBHOOK_SIGNING_KEY');

/** `issues` statuses that end a letter. Conservative: see the RULING above. */
export const TERMINAL_ISSUE_STATUSES = ['invalid', 'unprintable', 'cancelled', 'expired'];

const CATEGORY_BY_TYPE: Record<string, PingenCategory> = {
  webhook_issues: 'issues',
  webhook_sent: 'sent',
  webhook_undeliverable: 'undeliverable',
  webhook_delivered: 'delivered',
};

const MAX_DETAIL = 200;

export type PingenWebhookDeps = FailDeps & Pick<SubmitDeps, 'getSending'> & { findByProviderId(letterId: string): Promise<SendingRow | undefined> };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const dig = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((o, k) => (isObject(o) ? o[k] : undefined), v);

/** Raw body to one event. Throws on invalid JSON. */
export function splitPingenEvent(raw: Buffer): unknown[] {
  return [JSON.parse(raw.toString('utf8')) as unknown];
}

/** Stable across Pingen's retries: the event id, else a hash of the whole event. Never throws. */
export function pingenDedupeKey(event: unknown): string {
  const id = str(dig(event, 'data', 'relationships', 'event', 'data', 'id'));
  return id !== '' ? id : `h:${createHash('sha256').update(JSON.stringify(event) ?? String(event)).digest('hex')}`;
}

export const pingenClient: WebhookClient = {
  id: 'pingen',
  type: 'pingen',
  auth: { kind: 'hmac-body', header: 'Signature', secret: pingenWebhookSecret },
  tenant: { resolve: 'record' },
  split: (raw) => splitPingenEvent(raw),
  dedupeKey: (event) => pingenDedupeKey(event),
  maxBodyBytes: 100_000,
  retentionDays: 30,
};

interface ParsedEvent { category: PingenCategory; letterId: string; eventId: string; reason: string; rejected: boolean; trackingNumber: string }

function parse(payload: unknown): ParsedEvent | undefined {
  const category = CATEGORY_BY_TYPE[str(dig(payload, 'data', 'type'))];
  const letterId = str(dig(payload, 'data', 'relationships', 'deliverable', 'data', 'id'));
  if (!category || letterId === '' || dig(payload, 'data', 'relationships', 'deliverable', 'data', 'type') !== 'letters') return undefined;
  const attrs = dig(payload, 'data', 'attributes');
  return {
    category, letterId, eventId: pingenDedupeKey(payload),
    reason: str(dig(attrs, 'reason')).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL),
    rejected: category === 'issues' && TERMINAL_ISSUE_STATUSES.includes(str(dig(attrs, 'status')).toLowerCase()),
    trackingNumber: str(dig(attrs, 'tracking_number')).slice(0, MAX_DETAIL),
  };
}

/** The history detail: the Pingen event id (the dedupe marker), then at most Pingen's reason text. */
const detailOf = (e: ParsedEvent): string => `pingen:${e.eventId}${e.reason ? ` ${e.reason}` : ''}`;
const seen = (rec: SendingRow, e: ParsedEvent): boolean => rec.history.some((h) => (h.detail ?? '').startsWith(`pingen:${e.eventId}`));

/** The address-ish refusals count towards holding a Versand; everything else is 'other'. */
const failReasonOf = (reason: string): FailReason => (/address|adresse|recipient|postal|zip/i.test(reason) ? 'address' : 'other');

/** One «Adresse prüfen» task for the sender; never throws (the state change is already written). */
async function openAddressTask(deps: PingenWebhookDeps, rec: SendingRow, reason: string): Promise<void> {
  const tenantId = rec.tenants[0] ?? '';
  try {
    const mailing = await deps.loadMailing(rec.source, tenantId);
    if (!mailing) { logger.error('pingen-webhook: no Versand for the undeliverable letter, no task', { id: rec.id, source: rec.source }); return; }
    const relatedKey = `sending.${rec.id}.undeliverable`;
    if (await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId)) return;
    await deps.createTask({
      tenantId, name: `Adresse von ${rec.recipientName} prüfen`, assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName),
      dueInDays: 3, relatedModelType: 'sending', relatedKey, linkKey: rec.source, notes: `Brief ${rec.id}: ${reason || 'unzustellbar'}`,
    });
  } catch (err) {
    logger.error('pingen-webhook: task for an undeliverable letter not created', { id: rec.id, error: err instanceof Error ? err.message : String(err) });
  }
}

/** The states an event passes through: an undeliverable letter was necessarily sent, even if that event was lost. */
function nextSteps(rec: SendingRow, e: ParsedEvent): Array<'sent' | 'delivered' | 'undeliverable' | 'failed'> {
  const direct = nextSendingState(rec.state, e.category, e.rejected);
  if (direct) return [direct as 'sent' | 'delivered' | 'undeliverable' | 'failed'];
  if (e.category === 'undeliverable') {
    const viaSent = nextSendingState(rec.state, 'sent', false);
    if (viaSent === 'sent' && nextSendingState('sent', 'undeliverable', false)) return ['sent', 'undeliverable'];
  }
  return [];
}

const MAX_ATTEMPTS = 3;
const LIVE: Array<SendingRow['state']> = ['queued', 'submitting', 'submitted', 'sent'];

/** One task per letter for a problem Pingen reports without ending the letter; never throws. */
async function openIssueTask(deps: PingenWebhookDeps, rec: SendingRow, reason: string): Promise<void> {
  const tenantId = rec.tenants[0] ?? '';
  try {
    const mailing = await deps.loadMailing(rec.source, tenantId);
    if (!mailing) { logger.error('pingen-webhook: no Versand for the letter with a problem, no task', { id: rec.id, source: rec.source }); return; }
    const relatedKey = `sending.${rec.id}.issue`;
    if (await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId)) return;
    await deps.createTask({
      tenantId, name: `Pingen meldet ein Problem mit dem Brief an ${rec.recipientName}${reason ? `: ${reason.slice(0, 120)}` : ''}`,
      assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3, relatedModelType: 'sending', relatedKey, linkKey: rec.source, notes: `Brief ${rec.id}`,
    });
  } catch (err) {
    logger.error('pingen-webhook: task for a letter problem not created', { id: rec.id, error: err instanceof Error ? err.message : String(err) });
  }
}

export function makePingenHandler(deps: PingenWebhookDeps): WebhookHandler {
  return async (event) => {
    const e = parse(event.payload);
    if (!e) { logger.warn('pingen-webhook: not a letter event, ignored'); return { state: 'ignored' }; }
    let rec = await deps.findByProviderId(e.letterId);
    if (!rec) {
      // a letter sent outside the app, or our providerId write has not landed yet (Pingen retries on 5xx only)
      logger.warn('pingen-webhook: no sending for this letter, ignored', { letterId: e.letterId, category: e.category });
      return { state: 'ignored' };
    }
    const tenantId = rec.tenants[0];
    if (!tenantId) { logger.warn('pingen-webhook: the sending has no tenant, ignored', { id: rec.id }); return { state: 'ignored' }; }
    for (let attempt = 0; attempt < MAX_ATTEMPTS && rec; attempt++) {
      if (seen(rec, e)) return { state: 'handled', tenantId };
      const at = deps.now().toISOString();
      const steps = nextSteps(rec, e);
      const guard = rec.state;
      if (steps.length === 0) {
        // a problem report (or a late rejection) on a live letter: one task for the sender, before the marker so a replay still opens it
        if (e.category === 'issues' && LIVE.includes(rec.state)) await openIssueTask(deps, rec, e.reason);
        // history only: the state is not touched, the guard keeps a concurrent move from being overwritten
        if (await deps.updateSending(rec.id, { history: [...rec.history, { state: rec.state, at, detail: detailOf(e) }], updatedAt: at }, guard)) return { state: 'handled', tenantId };
      } else if (steps[steps.length - 1] === 'failed') {
        // marker, failure, reversal and task: the marker is the failed entry's detail, so one guarded write carries both
        await failSending(deps, rec, `Pingen hat den Brief abgelehnt${e.reason ? `: ${e.reason}` : ''}`, true, failReasonOf(e.reason), guard, detailOf(e));
        const fresh = await deps.getSending(rec.id);
        if (fresh?.state === 'failed') return { state: 'handled', tenantId };
        rec = fresh;
        continue;
      } else {
        const last = steps[steps.length - 1];
        const history = [...rec.history, ...steps.map((s, i) => ({ state: s, at, ...(i === steps.length - 1 ? { detail: detailOf(e) } : {}) }))];
        const patch: Partial<SendingRow> = { state: last, history, updatedAt: at };
        if (last === 'delivered' && e.trackingNumber) patch.trackingNumber = e.trackingNumber;
        if (await deps.updateSending(rec.id, patch, guard)) {
          if (last === 'undeliverable') await openAddressTask(deps, rec, e.reason); // no reversal: the letter was produced
          return { state: 'handled', tenantId };
        }
      }
      rec = await deps.getSending(rec.id); // the state moved under us: decide again from the new one
    }
    throw new Error('pingen-webhook: the sending kept changing, retry'); // the receiver marks the row failed
  };
}

function productionDeps(): PingenWebhookDeps {
  const base = sendingDeps();
  return {
    ...base,
    findByProviderId: async (letterId) => {
      const snap = await getFirestore().collection(SendingCollection).where('providerId', '==', letterId).limit(1).get();
      const d = snap.docs[0];
      return d ? ({ ...(d.data() as Omit<SendingRow, 'id'>), id: d.id }) : undefined;
    },
  };
}

export const pingenHandler: WebhookHandler = (event, eventId) => makePingenHandler(productionDeps())(event, eventId);
