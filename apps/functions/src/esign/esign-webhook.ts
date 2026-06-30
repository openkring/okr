// apps/functions/src/esign/esign-webhook.ts
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { webhookSecret, REGION, verifyWebhookToken } from './shared';
import { EsignCollection } from '@bk2/shared-models';

const TERMINAL_STATUSES = ['signed', 'rejected', 'withdrawn'];

export const esignWebhook = onRequest(
  { region: REGION, secrets: [webhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const esignId = req.query['esignId'] as string | undefined;
    const token   = req.query['token']   as string | undefined;

    if (!esignId || !token) {
      res.status(400).send('Missing esignId or token');
      return;
    }

    if (!verifyWebhookToken(esignId, token, webhookSecret.value())) {
      logger.warn('esignWebhook: invalid token', { esignId });
      res.status(401).send('Unauthorized');
      return;
    }

    // DeepSign CallbackInfo body (confirmed via int callback): event-based, not status-based.
    const payload = req.body as {
      eventType?: 'signee-completed' | 'document-completed';
      documentId?: string;
      signeeId?: string;
      signeeType?: string;
      timestamp?: string;
    };

    const db = getFirestore();
    const docRef = db.collection(EsignCollection).doc(esignId);
    const snap = await docRef.get();

    if (!snap.exists) {
      logger.warn('esignWebhook: unknown esignId', { esignId });
      res.status(200).send('OK');
      return;
    }

    const record = snap.data() as { documentStatus: string };

    // Idempotency: nothing more to do once the document is in a terminal state.
    if (TERMINAL_STATUSES.includes(record.documentStatus)) {
      res.status(200).send('OK');
      return;
    }

    const eventTime = payload.timestamp ? Timestamp.fromDate(new Date(payload.timestamp)) : Timestamp.now();
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (payload.eventType === 'signee-completed' && payload.signeeId) {
      // Mark the matching signee as signed.
      const currentSignees = (snap.data()?.['signees'] ?? []) as Array<Record<string, unknown>>;
      update['signees'] = currentSignees.map(s =>
        s['signeeId'] === payload.signeeId
          ? { ...s, signStatus: 'signed', signedTime: eventTime, completionTime: eventTime }
          : s,
      );
      update['events'] = FieldValue.arrayUnion({ type: 'signee-signed', at: eventTime, signeeId: payload.signeeId });
    } else if (payload.eventType === 'document-completed') {
      // Whole document signed → terminal. esignArchiveSigned picks this up to archive the PDF.
      update['documentStatus'] = 'signed';
      update['signStatus'] = 'signed';
      update['completionTime'] = eventTime;
      update['events'] = FieldValue.arrayUnion({ type: 'completed', at: eventTime });
    } else {
      // Unknown / unhandled event — acknowledge so DeepSign doesn't retry.
      logger.warn('esignWebhook: unhandled eventType', { esignId, eventType: payload.eventType });
      res.status(200).send('OK');
      return;
    }

    await docRef.update(update);
    logger.info('esignWebhook: updated', { esignId, eventType: payload.eventType });
    res.status(200).send('OK');
  },
);
