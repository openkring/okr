// apps/functions/src/_webhooks/verify.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookClient, WebhookRequest } from './types';

/** HMAC-SHA256 hex over the raw body, compared in constant time. Never throws. */
export function verifyHmacHex(rawBody: Buffer | undefined, signature: string | undefined, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  // Buffer.from(.., 'hex') stops at the first non-hex character, so check the shape first.
  if (signature.length !== expected.length * 2 || !/^[0-9a-fA-F]+$/.test(signature)) return false;
  try {
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/** Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]. HMAC-SHA256 over `${t}.${rawBody}`. Never throws. */
export function verifyStripeSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
  nowSec: number,
  toleranceSec: number,
): boolean {
  if (!rawBody || !header || !secret) return false;
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return false;
  if (!(Math.abs(nowSec - Number(t)) <= toleranceSec)) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  let match = false;
  for (const sig of v1) {
    if (sig.length !== expected.length * 2 || !/^[0-9a-fA-F]+$/.test(sig)) continue;
    try {
      if (timingSafeEqual(expected, Buffer.from(sig, 'hex'))) match = true;
    } catch {
      /* ignore */
    }
  }
  return match;
}

export function verifyClient(client: WebhookClient, req: WebhookRequest, secret: string, nowSec: number): boolean {
  const auth = client.auth;
  if (auth.kind === 'stripe-signature')
    return verifyStripeSignature(req.rawBody, req.header('stripe-signature'), secret, nowSec, auth.toleranceSec);
  if (auth.kind === 'hmac-body') return verifyHmacHex(req.rawBody, req.header(auth.header), secret);
  return auth.verify(req, secret);
}
