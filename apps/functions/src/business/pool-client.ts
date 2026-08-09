// apps/functions/src/business/pool-client.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { REGION, requireAdmin } from './shared';
import { callPlatform, meteringConfig, readConfig } from './push';
import type { MeteringConfig } from './push';

/**
 * C5 §5 — the **partner side** of the prospect pool, shipped inside the product.
 *
 * The symmetric half of `pushMeteringToPlatform` (C3 §3), and here for the same reason: every
 * openkring installation carries this code, only one configured with `METERING_CONFIG` uses it,
 * and no partner writes their own integration against bkaiser's callables. Without it a partner
 * would have to hand-roll a client — including the service-identity sign-in — which is how three
 * partners end up with three different bugs in the one place where a race decides who owns a lead.
 *
 * It is a **proxy, not a copy**: `listProspects`/`claimProspect`/`releaseProspect` on bkaiser's
 * side stay the only authority on who may see and hold what. This end contributes exactly two
 * things the platform side cannot: the partner's service credential (never handed to a browser),
 * and the local admin check — the partner's own staff, in the partner's own installation.
 *
 * No local cache. A claim is decided in a transaction on bkaiser's side and a cached pool would
 * show a lead that is already gone; a stale list is worse than a slow one when the whole feature
 * is first-claim-wins.
 */

function partnerConfig(fnName: string): MeteringConfig {
  const config = readConfig();
  if (!config) {
    // Not a partner installation, or a half-configured one. Either way there is no identity to
    // call bkaiser with, and the honest answer is that this installation has no pool.
    throw new HttpsError('failed-precondition',
      `${fnName}: this installation has no METERING_CONFIG — it is not a partner installation.`);
  }
  return config;
}

function prospectKeyOf(data: unknown): { prospectKey: string } {
  const prospectKey = String((data as Record<string, unknown> ?? {})['prospectKey'] ?? '');
  if (!prospectKey) throw new HttpsError('invalid-argument', 'prospectKey is required.');
  return { prospectKey };
}

/** The open pool plus this partner's own claims — bkaiser decides which is which. */
export const listPoolProspects = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'listPoolProspects');
    return callPlatform(partnerConfig('listPoolProspects'), 'listProspects', {});
  },
);

/**
 * Claim a lead. Returns `{ ok: false, reason }` rather than throwing when another partner won the
 * race — that is a normal outcome of an open pool, not an error, and the UI has to say which lead
 * was lost to whom-ever, not show a stack trace.
 *
 * The contact details come back in this response and nowhere else: bkaiser releases them **on
 * claim**, because claiming is what makes the disclosure to this partner lawful (C5 §4). Whatever
 * this installation stores of them from here on, it stores as an independent controller
 * (Vertragswerk Teil III.2) — including the erasure duty when bkaiser reports a revocation.
 */
export const claimPoolProspect = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'claimPoolProspect');
    const payload = prospectKeyOf(request.data);
    const result = await callPlatform<{ ok: boolean; reason?: string }>(
      partnerConfig('claimPoolProspect'), 'claimProspect', payload);
    logger.info(`claimPoolProspect: ${payload.prospectKey} → ${result.ok ? 'claimed' : result.reason}`);
    return result;
  },
);

/** C5 §7 — early decline: give a lead back before the three months are up. */
export const releasePoolProspect = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'releasePoolProspect');
    const payload = prospectKeyOf(request.data);
    logger.info(`releasePoolProspect: releasing ${payload.prospectKey}`);
    return callPlatform(partnerConfig('releasePoolProspect'), 'releaseProspect', payload);
  },
);
