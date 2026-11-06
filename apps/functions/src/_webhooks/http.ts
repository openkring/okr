// apps/functions/src/_webhooks/http.ts
//
// The shared receiver function: one URL per client, `/<clientId>`. Adapts the
// Express request to `ingest` and supplies its real Firestore / secret / clock.
// Logs carry the client id only, never payload, query string, token or signature.
import { onRequest, type Request, type Response } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { findClient, WEBHOOK_SECRETS } from './clients';
import { ingest } from './ingest';
import { WebhookEventCollection } from './types';
import type { IngestDeps, WebhookClient, WebhookRequest } from './types';

const ALREADY_EXISTS = 6;

/** The first path segment: `/mailtrap` and `/mailtrap/x` are both `mailtrap`. */
export function clientFromPath(path: string): string {
  return path.split('/').find(s => s !== '') ?? '';
}

const realDeps: IngestDeps = {
  writeEvent: async (id, event) => {
    try {
      await getFirestore().collection(WebhookEventCollection).doc(id).create(event);
      return 'created';
    } catch (error) {
      if ((error as { code?: number }).code === ALREADY_EXISTS) return 'duplicate';
      throw error;
    }
  },
  secretValue: client => client.auth.secret.value(),
  now: () => Date.now(),
};

function toWebhookRequest(req: Request): WebhookRequest {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') query[k] = v;
  return { method: req.method, rawBody: req.rawBody, query, header: name => req.header(name) };
}

export function handleWebhook(resolve: (req: Request) => WebhookClient | undefined) {
  return async (req: Request, res: Response): Promise<void> => {
    const client = resolve(req);
    try {
      const result = await ingest(client, toWebhookRequest(req), realDeps);
      res.status(result.status).send(result.body);
    } catch {
      // e.g. the client's secret is unset. Say nothing about why.
      logger.error('webhooks: receiver failed', { clientId: client?.id });
      res.status(500).send('Internal Server Error');
    }
  };
}

export const webhooks = onRequest(
  { region: 'europe-west6', secrets: WEBHOOK_SECRETS },
  handleWebhook(req => findClient(clientFromPath(req.path))),
);
