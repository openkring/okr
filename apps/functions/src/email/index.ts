import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';

// Per-webhook signing secret from the Mailtrap dashboard (webhook details).
// Set with: firebase functions:secrets:set MAILTRAP_WEBHOOK_SECRET
const mailtrapWebhookSecret = defineSecret('MAILTRAP_WEBHOOK_SECRET');

/**
 * Verify Mailtrap's `Mailtrap-Signature` header: HMAC-SHA256 (hex) of the RAW
 * request body, computed with the webhook's signing secret. Constant-time compare.
 */
function verifyMailtrapSignature(rawBody: Buffer | undefined, signature: string | undefined, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

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
  { region: 'europe-west6', secrets: [mailtrapWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Authenticate the sender: reject anything not signed with the webhook secret,
    // so forged delivery/bounce telemetry cannot be injected into emailEvents (M-5).
    const signature = req.header('Mailtrap-Signature');
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!verifyMailtrapSignature(rawBody, signature, mailtrapWebhookSecret.value())) {
      logger.warn('mailtrapWebhook: invalid or missing Mailtrap-Signature — rejecting');
      res.status(401).send('Unauthorized');
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
