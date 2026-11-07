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
import { ESIGN_LEGACY_CUTOFF_ISO, deepSignLegacyClient, legacyGate, type LegacyGateDeps } from './deepsign-webhook';
import { REGION, webhookSecret } from './shared';

const receive = handleWebhook(() => deepSignLegacyClient);

const gateDeps: LegacyGateDeps = {
  verify: req => deepSignLegacyClient.auth.kind === 'record-token' && deepSignLegacyClient.auth.verify(req, webhookSecret.value()),
  readCreatedAt: async esignId => {
    const snap = await getFirestore().collection(EsignCollection).doc(esignId).get();
    return { exists: snap.exists, createdAt: snap.data()?.['createdAt'] as Timestamp | undefined };
  },
};

export const esignWebhook = onRequest({ region: REGION, secrets: [webhookSecret] }, async (req, res) => {
  const clientId = deepSignLegacyClient.id;
  if (req.method === 'POST') {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') query[k] = v;
    const probe: WebhookRequest = { method: req.method, rawBody: req.rawBody, query, header: () => undefined };
    try {
      // An unset secret verifies nothing (verifyWebhookToken rejects ''), so the call goes on to the receiver (401).
      if ((await legacyGate(probe, ESIGN_LEGACY_CUTOFF_ISO, gateDeps)) === 'refuse') {
        logger.warn('webhooks: legacy call refused by cutoff', { clientId, status: 403 });
        res.status(403).send('Forbidden');
        return;
      }
    } catch {
      logger.error('webhooks: legacy cutoff check failed', { clientId });
      res.status(500).send('Internal Server Error');
      return;
    }
  }
  await receive(req, res);
});
