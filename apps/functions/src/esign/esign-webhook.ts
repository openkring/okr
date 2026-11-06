// apps/functions/src/esign/esign-webhook.ts
//
// Legacy URL for documents sent before the cutover (their DeepSign callbackUrl points here).
// A thin wrapper on the shared receiver (_webhooks) with the legacy key. New documents use
// /webhooks/deepsign. Retired together with webhookSecret.
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { EsignCollection } from '@okr/shared-models';
import { handleWebhook } from '../_webhooks/http';
import type { WebhookRequest } from '../_webhooks/types';
import { ESIGN_LEGACY_CUTOFF_ISO, deepSignLegacyClient, refusedByCutoff } from './deepsign-webhook';
import { REGION, webhookSecret } from './shared';

const receive = handleWebhook(() => deepSignLegacyClient);

export const esignWebhook = onRequest({ region: REGION, secrets: [webhookSecret] }, async (req, res) => {
  const clientId = deepSignLegacyClient.id;
  // Only a call with a valid token may cost a read. An invalid one goes on to the receiver (401).
  if (ESIGN_LEGACY_CUTOFF_ISO !== '' && req.method === 'POST' && deepSignLegacyClient.auth.kind === 'record-token') {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') query[k] = v;
    const probe: WebhookRequest = { method: req.method, rawBody: req.rawBody, query, header: () => undefined };
    let valid = false;
    try {
      valid = deepSignLegacyClient.auth.verify(probe, webhookSecret.value());
    } catch {
      valid = false; // unset secret: the receiver answers
    }
    if (valid) {
      try {
        const snap = await getFirestore().collection(EsignCollection).doc(query['esignId']).get();
        const createdAt = snap.exists ? (snap.data()?.['createdAt'] as Timestamp | undefined) : undefined;
        if (snap.exists && refusedByCutoff(createdAt, ESIGN_LEGACY_CUTOFF_ISO)) {
          logger.warn('esignWebhook: refused by cutoff', { clientId, status: 403 });
          res.status(403).send('Forbidden');
          return;
        }
      } catch {
        logger.error('esignWebhook: cutoff check failed', { clientId });
        res.status(500).send('Internal Server Error');
        return;
      }
    }
  }
  await receive(req, res);
});
