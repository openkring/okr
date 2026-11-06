// apps/functions/src/_webhooks/ingest.ts
//
// Steps 1-6 of the receiver flow (design §5). Pure of HTTP and Firestore: the
// caller injects the write, the secret and the clock. Logs carry client id and
// status only, never payload, query string, token or signature.
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { IngestDeps, StoredWebhookEvent, WebhookClient, WebhookRequest } from './types';
import { verifyClient } from './verify';

const DAY_MS = 24 * 60 * 60 * 1000;

export function eventDocId(clientId: string, dedupeKey: string): string {
  return createHash('sha256').update(`${clientId}\0${dedupeKey}`).digest('hex');
}

function tenantsOf(client: WebhookClient): string[] {
  return 'fixed' in client.tenant ? [client.tenant.fixed] : [];
}

export async function ingest(
  client: WebhookClient | undefined,
  req: WebhookRequest,
  deps: IngestDeps,
): Promise<{ status: number; body: string }> {
  if (!client) return { status: 404, body: 'Not Found' };

  const reject = (status: number, body: string) => {
    logger.warn('webhook rejected', { clientId: client.id, status });
    return { status, body };
  };

  if (req.method !== 'POST') return reject(405, 'Method Not Allowed');
  if ((req.rawBody?.length ?? 0) > client.maxBodyBytes) return reject(413, 'Payload Too Large');
  if (!verifyClient(client, req, deps.secretValue(client))) return reject(401, 'Unauthorized');

  let events: unknown[];
  let ids: string[];
  try {
    events = client.split(req.rawBody as Buffer, req);
    ids = events.map(e => eventDocId(client.id, client.dedupeKey(e, req)));
  } catch {
    return reject(400, 'Bad Request');
  }
  if (events.length === 0) return { status: 200, body: 'OK' };

  const nowMs = deps.now();
  const results = await Promise.allSettled(
    events.map((payload, i) => {
      const row: StoredWebhookEvent = {
        clientId: client.id,
        type: client.type,
        tenants: tenantsOf(client),
        receivedAt: Timestamp.fromMillis(nowMs),
        payload,
        state: 'received',
        expiresAt: Timestamp.fromMillis(nowMs + client.retentionDays * DAY_MS),
      };
      return deps.writeEvent(ids[i], row);
    }),
  );

  if (results.some(r => r.status === 'rejected')) {
    logger.error('webhooks: write failed', { clientId: client.id, state: 'received' });
    return { status: 500, body: 'Internal Server Error' };
  }
  return { status: 200, body: 'OK' };
}
