// apps/functions/src/email/mailtrap-webhook.ts
//
// Mailtrap's delivery/bounce telemetry on the shared webhook receiver (_webhooks).
// Plain data and pure functions; the only side effects are the secret reference and the
// Firestore write, which is injected so the handler is testable without Firestore.
//
// Events are stored in the emailEvents Firestore collection with a 30-day TTL.
// Configure the TTL policy in the Firebase console:
//   Firestore → Indexes → Single-field TTL → Collection: emailEvents, Field: expiresAt
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import type { WebhookHandler } from '../_webhooks/process';
import type { WebhookClient } from '../_webhooks/types';

// Per-webhook signing secret from the Mailtrap dashboard (webhook details).
// Set with: firebase functions:secrets:set MAILTRAP_WEBHOOK_SECRET
export const mailtrapWebhookSecret = defineSecret('MAILTRAP_WEBHOOK_SECRET');

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Raw body → one entry per event. Accepts a JSON array, JSON Lines, a single object, or
 * Mailtrap's `{ events: [...] }` wrapper. Throws on invalid JSON.
 */
export function splitMailtrapEvents(raw: Buffer): unknown[] {
  const text = raw.toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not one JSON document: read it as JSON Lines (a bad line throws).
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as unknown);
  }
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed) && Array.isArray(parsed['events'])) return parsed['events'];
  return [parsed];
}

/** Stable across provider retries: `event_id` when present, else message, kind and time. */
export function mailtrapDedupeKey(event: unknown): string {
  if (!isObject(event)) throw new Error('Mailtrap event is not an object');
  const id = event['event_id'];
  if (typeof id === 'string' && id !== '') return id;
  return `${String(event['message_id'])}|${String(event['event'])}|${String(event['timestamp'])}`;
}

export const mailtrapClient: WebhookClient = {
  id: 'mailtrap',
  type: 'mailtrap',
  auth: { kind: 'hmac-body', header: 'Mailtrap-Signature', secret: mailtrapWebhookSecret },
  tenant: { scope: 'platform' },
  split: raw => splitMailtrapEvents(raw),
  dedupeKey: event => mailtrapDedupeKey(event),
  maxBodyBytes: 5_000_000,
  retentionDays: 30,
};

export type EmailEventWriter = (id: string, data: Record<string, unknown>) => Promise<void>;

const writeEmailEvent: EmailEventWriter = async (id, data) => {
  await getFirestore().collection('emailEvents').doc(id).set(data);
};

/**
 * One flat emailEvents row per event (what /aoc/email reads), keyed by the webhook row id
 * so a replay overwrites instead of adding a second row.
 */
export function makeMailtrapHandler(write: EmailEventWriter): WebhookHandler {
  return async (event, eventId) => {
    // Generic text: the payload is provider data and must not end up in failure reports.
    if (!isObject(event.payload)) throw new Error('Mailtrap event payload is not an object');
    await write(eventId, { ...event.payload, receivedAt: event.receivedAt, expiresAt: event.expiresAt });
    return { state: 'handled' };
  };
}

export const mailtrapHandler: WebhookHandler = makeMailtrapHandler(writeEmailEvent);
