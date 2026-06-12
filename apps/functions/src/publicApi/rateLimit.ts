// apps/functions/src/publicApi/rateLimit.ts
//
// Best-effort fixed-window rate limiting for the public, unauthenticated API
// (M-7 hardening). The /contact route relays email through the provider; without
// a limit it can be abused as a spam relay or to run up cost. App Check is not
// available on the plain-HTML static sites, so we throttle by client IP (raises
// the bar against casual abuse) plus a global backstop (bounds total volume even
// if the per-IP key is spoofed via X-Forwarded-For).
//
// Counters live in `_rateLimits` (Admin-SDK only; client read/write denied in
// firestore.rules). Each doc carries `expiresAt` — configure a Firestore TTL
// policy on `_rateLimits.expiresAt` to auto-purge stale buckets.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import type { Request } from 'express';

export interface RateLimitOptions {
  limit: number;      // max requests allowed per window
  windowMs: number;   // window length in milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Derive a best-effort client IP. Behind the GCP front end the real client IP is
 * appended to X-Forwarded-For, so the leftmost token is client-controllable and
 * only suitable for coarse, best-effort throttling — never as a security
 * boundary. Pair per-IP limits with a global backstop.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || 'unknown';
}

/**
 * Atomically increment a fixed-window counter for `bucket:key`. Returns whether
 * the request is allowed. Fails OPEN (allows the request) on a transient
 * datastore error so a Firestore blip cannot take the contact form fully offline.
 */
export async function checkRateLimit(
  bucket: string,
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const db = getFirestore();
  const hashed = createHash('sha256').update(key).digest('hex').slice(0, 32);
  const ref = db.collection('_rateLimits').doc(`${bucket}_${hashed}`);
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const windowStart = data ? (data['windowStart'] as Timestamp).toMillis() : 0;
      const count = data ? (data['count'] as number) : 0;

      if (!data || now - windowStart >= opts.windowMs) {
        tx.set(ref, {
          count: 1,
          windowStart: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + opts.windowMs),
        });
        return { allowed: true, remaining: opts.limit - 1, retryAfterMs: 0 };
      }

      if (count >= opts.limit) {
        return { allowed: false, remaining: 0, retryAfterMs: opts.windowMs - (now - windowStart) };
      }

      tx.update(ref, { count: count + 1 });
      return { allowed: true, remaining: opts.limit - (count + 1), retryAfterMs: 0 };
    });
  } catch {
    // Fail open: never let a datastore error block legitimate submissions.
    return { allowed: true, remaining: opts.limit, retryAfterMs: 0 };
  }
}
