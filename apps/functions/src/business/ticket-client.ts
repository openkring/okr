// apps/functions/src/business/ticket-client.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { REGION, requireAdmin } from './shared';
import { callPlatform, installedVersion, meteringConfig, readConfig } from './push';
import type { MeteringConfig } from './push';

/**
 * C4 §4 — the **partner side** of the escalation queue, shipped inside the product.
 *
 * The third instance of the pattern C3 §3 established and C5 §5 repeated, and here for the same
 * reason: every openkring installation carries this code, only one configured with
 * `METERING_CONFIG` uses it, and no partner hand-rolls a client against bkaiser's callables —
 * including the service-identity sign-in. Three partners writing their own integration is three
 * different bugs in the one place a submission decides whether an SLA clock starts.
 *
 * It is a **proxy, not a copy**. `submitTicket` / `listTickets` / `commentTicket` on bkaiser's side
 * stay the only authority on the supported-version window, the required-field set and who may see
 * what. This end contributes exactly three things the platform side cannot:
 *  - the partner's service credential, which never reaches a browser;
 *  - the local admin check — the partner's own staff, in the partner's own installation;
 *  - `appVersion`, read from **this** installation's `app-version` doc rather than typed in. That is
 *    the one field the §3 gate actually turns on, and a hand-typed version is the field a partner
 *    would get wrong precisely when it matters.
 *
 * No local mirror of the queue. bkaiser's copy is the queue (§1: no federation), and a cached list
 * would show an SLA deadline that has already moved.
 */

function partnerConfig(fnName: string): MeteringConfig {
  const config = readConfig();
  if (!config) {
    // Not a partner installation, or a half-configured one. Either way there is no identity to call
    // bkaiser with, and the honest answer is that this installation has no escalation channel.
    throw new HttpsError('failed-precondition',
      `${fnName}: this installation has no METERING_CONFIG — it is not a partner installation.`);
  }
  return config;
}

/**
 * Escalate to bkaiser's 3LS.
 *
 * `ok: false` comes back for an incomplete submission (with the field names) and for one outside the
 * supported window (with the reason) — both normal outcomes of the §3 gate, not errors, and the
 * partner's UI has to say which of the two it was rather than show a stack trace.
 *
 * The Firebase project id and the running version are filled in here, from this installation. What
 * the partner's staff supply is what only they know: what broke, where, and how to reproduce it.
 */
export const submitSupportTicket = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'submitSupportTicket');
    const config = partnerConfig('submitSupportTicket');
    const values = (request.data ?? {}) as Record<string, unknown>;

    const payload = {
      ...values,
      appVersion: await installedVersion(),
      // The runtime's own project id — the §3 required field a partner would otherwise mistype.
      firebaseProjectId: process.env['GCLOUD_PROJECT'] ?? '',
    };
    const result = await callPlatform<{ ok: boolean; okey: string; rejectedReason: string; missing: string[] }>(
      config, 'submitTicket', payload);
    const outcome = result.ok ? 'queued ' + result.okey
      : (result.rejectedReason || 'incomplete: ' + result.missing.join(', '));
    logger.info(`submitSupportTicket: ${outcome}`);
    return result;
  },
);

/** This partner's own queue; with a `ticketKey`, that one ticket plus its comment thread. */
export const listSupportTickets = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'listSupportTickets');
    const ticketKey = String((request.data ?? {}).ticketKey ?? '');
    return callPlatform(partnerConfig('listSupportTickets'), 'listTickets', { ticketKey });
  },
);

/**
 * Add to the thread. The text is redacted **on bkaiser's side** before it is written (§6.1) — not
 * here, so that there is one redaction and it runs where the record is created, on code a partner
 * cannot weaken without shipping a fork.
 */
export const commentSupportTicket = onCall(
  { region: REGION, secrets: [meteringConfig] },
  async (request) => {
    await requireAdmin(request, 'commentSupportTicket');
    const values = (request.data ?? {}) as Record<string, unknown>;
    const ticketKey = String(values['ticketKey'] ?? '');
    const text = String(values['text'] ?? '');
    if (!ticketKey || !text) throw new HttpsError('invalid-argument', 'ticketKey and text are required.');
    return callPlatform(partnerConfig('commentSupportTicket'), 'commentTicket', { ticketKey, text });
  },
);
