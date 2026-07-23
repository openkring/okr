// apps/functions/src/_gateway/quota.ts
//
// Durable quota. Two layers:
//  1. per-caller sliding window (reuses publicApi/rateLimit.ts — Firestore-backed,
//     fail-open, real across instances). Throttles a single tenant/user.
//  2. per-provider MONTHLY cap in `_apiQuota` — because the failure mode is a BILL.
//     On breach the gateway serves stale cache, then fails soft.
// The monthly counter is also 2.59's "measure first" — usage per provider for free.

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { checkRateLimit } from '../publicApi/rateLimit';
import type { GatewayContext, WindowLimit } from './provider';

const DEFAULT_WINDOW: WindowLimit = { limit: 60, windowMs: 60_000 }; // 60/min/caller

/** Pure: UTC year-month bucket for the monthly counter. */
export function monthKey(nowMs: number): string {
  const d = new Date(nowMs);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}`;
}

/**
 * Per-caller window. Keyed by uid when present, else tenantId. Throws
 * resource-exhausted when exceeded. Fails open on a datastore blip (the
 * underlying limiter does).
 */
export async function checkWindowQuota(
  providerId: string,
  ctx: GatewayContext,
  window: WindowLimit = DEFAULT_WINDOW,
): Promise<void> {
  const key = ctx.uid ?? ctx.tenantId;
  const res = await checkRateLimit(`gw_${providerId}`, key, window);
  if (!res.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Rate limit exceeded for ${providerId}. Retry later.`,
      { retryAfterMs: res.retryAfterMs },
    );
  }
}

/** Read the current month's upstream-call count for a provider. */
export async function getMonthlyCount(providerId: string, nowMs: number): Promise<number> {
  try {
    const ref = getFirestore().collection('_apiQuota').doc(`${providerId}_${monthKey(nowMs)}`);
    const snap = await ref.get();
    return snap.exists ? ((snap.data()?.['count'] as number) ?? 0) : 0;
  } catch (err) {
    logger.warn('_apiQuota read failed', { providerId, message: (err as Error).message });
    return 0; // fail open on read — the write-side increment still bounds growth
  }
}

/** Increment the current month's counter after a real upstream call. Fail-soft. */
export async function incrementMonthlyCount(providerId: string, nowMs: number): Promise<void> {
  try {
    const key = monthKey(nowMs);
    const ref = getFirestore().collection('_apiQuota').doc(`${providerId}_${key}`);
    // expiresAt ~ 40 days out → Firestore TTL policy on `_apiQuota.expiresAt` purges old months.
    await ref.set(
      {
        providerId,
        month: key,
        count: FieldValue.increment(1),
        expiresAt: Timestamp.fromMillis(nowMs + 40 * 24 * 60 * 60 * 1000),
      },
      { merge: true },
    );
  } catch (err) {
    logger.warn('_apiQuota increment failed', { providerId, message: (err as Error).message });
  }
}
