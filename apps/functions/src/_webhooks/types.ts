// apps/functions/src/_webhooks/types.ts
//
// The inbound-webhook contract. A client declares WHO sends and HOW to read it;
// the receiver (ingest.ts) supplies verification, size limits, duplicate
// detection and storage. Type-only imports from `firebase-functions`: no values.

// See _gateway/provider.ts: SecretParam is derived from the public `defineSecret`
// export because firebase-functions@6 does not re-export the type.
import type { defineSecret } from 'firebase-functions/params';
import type { Timestamp } from 'firebase-admin/firestore';
type SecretParam = ReturnType<typeof defineSecret>;

export const WebhookEventCollection = 'webhook-events';

export type WebhookEventState = 'received' | 'logged' | 'handled' | 'ignored' | 'failed' | 'replayed';

/** The slice of an HTTP request a client may look at. */
export interface WebhookRequest {
  method: string;
  rawBody: Buffer | undefined;
  query: Record<string, string>;
  header(name: string): string | undefined;
}

export interface WebhookClient {
  /** Stable slug: the URL segment, part of the dedupe hash, and in logs. */
  id: string;
  /** Selects the handler in onWebhookEvent. Several clients may share a type. */
  type: string;
  /** How the sender is authenticated. */
  auth:
    | { kind: 'hmac-body'; header: string; secret: SecretParam }
    | { kind: 'record-token'; verify: (req: WebhookRequest, secret: string) => boolean; secret: SecretParam };
  /** A fixed tenant, the operator scope, or resolved by the handler from our own record. */
  tenant: { fixed: string } | { scope: 'platform' } | { resolve: 'record' };
  /** Raw request → one entry per event. Always a list. */
  split(raw: Buffer, req: WebhookRequest): unknown[];
  /** Stable across provider retries. */
  dedupeKey(event: unknown, req: WebhookRequest): string;
  maxBodyBytes: number;
  retentionDays: number;
}

export interface StoredWebhookEvent {
  clientId: string;
  type: string;
  tenants: string[];
  receivedAt: Timestamp;
  payload: unknown;
  state: WebhookEventState;
  error?: string;
  expiresAt: Timestamp;
  /** Set by scripts/webhook-replay.mjs on a copy: the root row's id (idempotent handlers key on it). */
  replayOf?: string;
  replayedAt?: Timestamp;
}

export interface IngestDeps {
  /** Firestore create(); 'duplicate' on ALREADY_EXISTS. */
  writeEvent(id: string, event: StoredWebhookEvent): Promise<'created' | 'duplicate'>;
  secretValue(client: WebhookClient): string;
  now(): number;
}
