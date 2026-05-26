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

    const payload = req.body as {
      documentId?: string;
      documentStatus?: string;
      signStatus?: string;
      signeeId?: string;
      viewedTime?: string;
      signedTime?: string;
      completionTime?: string;
      signeeComment?: string;
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
    const newDocStatus = payload.documentStatus;

    // Idempotency: ignore if already terminal with same status
    if (TERMINAL_STATUSES.includes(record.documentStatus) && newDocStatus === record.documentStatus) {
      res.status(200).send('OK');
      return;
    }

    const now = Timestamp.now();
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      events: FieldValue.arrayUnion({ type: newDocStatus, at: now, payload }),
    };

    if (newDocStatus) update['documentStatus'] = newDocStatus;
    if (payload.signStatus) update['signStatus'] = payload.signStatus;

    // Update matching signee entry
    if (payload.signeeId) {
      const currentSignees = (snap.data()?.['signees'] ?? []) as Array<Record<string, unknown>>;
      const updatedSignees = currentSignees.map(s => {
        if (s['signeeId'] !== payload.signeeId) return s;
        return {
          ...s,
          ...(payload.signStatus   ? { signStatus:      payload.signStatus   } : {}),
          ...(payload.viewedTime   ? { viewedTime:      Timestamp.fromDate(new Date(payload.viewedTime))   } : {}),
          ...(payload.signedTime   ? { signedTime:      Timestamp.fromDate(new Date(payload.signedTime))   } : {}),
          ...(payload.completionTime ? { completionTime: Timestamp.fromDate(new Date(payload.completionTime)) } : {}),
          ...(payload.signeeComment ? { signeeComment:  payload.signeeComment  } : {}),
        };
      });
      update['signees'] = updatedSignees;
    }

    // Set completionTime if terminal
    if (newDocStatus && TERMINAL_STATUSES.includes(newDocStatus)) {
      update['completionTime'] = now;
    }

    await docRef.update(update);
    logger.info('esignWebhook: updated', { esignId, newDocStatus });
    res.status(200).send('OK');
  },
);
