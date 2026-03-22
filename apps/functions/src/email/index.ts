import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

interface MailtrapWebhookEvent {
  event: string;
  timestamp?: number;
  message_id?: string;
  email?: string;
  from?: string;
  subject?: string;
  sending_stream?: string;
  category?: string;
  response?: string;
  [key: string]: unknown;
}

/**
 * Webhook receiver for Mailtrap email events.
 * Supports both JSON array and JSON Lines request bodies.
 * Events are stored in the emailEvents Firestore collection with a 30-day TTL.
 * Configure the TTL policy in the Firebase console:
 *   Firestore → Indexes → Single-field TTL → Collection: emailEvents, Field: expiresAt
 */
export const mailtrapWebhook = onRequest(
  { region: 'europe-west6' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    let events: MailtrapWebhookEvent[] = [];
    try {
      if (Array.isArray(req.body)) {
        events = req.body;
      } else if (typeof req.body === 'string') {
        events = req.body
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } else if (req.body && typeof req.body === 'object') {
        events = [req.body as MailtrapWebhookEvent];
      }
    } catch (e) {
      logger.error('mailtrapWebhook: failed to parse body', e);
      res.status(400).send('Bad Request');
      return;
    }

    if (events.length === 0) {
      res.status(200).send('OK');
      return;
    }

    const db = getFirestore();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const batch = db.batch();
    for (const event of events) {
      const ref = db.collection('emailEvents').doc();
      batch.set(ref, { ...event, receivedAt: now, expiresAt });
    }

    await batch.commit();
    logger.info(`mailtrapWebhook: stored ${events.length} event(s)`);
    res.status(200).send('OK');
  }
);
