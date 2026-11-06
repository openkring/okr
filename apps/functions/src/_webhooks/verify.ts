// apps/functions/src/_webhooks/verify.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookClient, WebhookRequest } from './types';

/** HMAC-SHA256 hex over the raw body, compared in constant time. Never throws. */
export function verifyHmacHex(rawBody: Buffer | undefined, signature: string | undefined, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  try {
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export function verifyClient(client: WebhookClient, req: WebhookRequest, secret: string): boolean {
  const auth = client.auth;
  if (auth.kind === 'hmac-body') return verifyHmacHex(req.rawBody, req.header(auth.header), secret);
  return auth.verify(req, secret);
}
