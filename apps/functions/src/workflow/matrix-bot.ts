// apps/functions/src/workflow/matrix-bot.ts
//
// The `sendMessage` action's transport: a system bot writes into its DM with the
// responsible person (planning/specs/2026-08-15-approval-workflow-spec.md §2.3).
//
// The bot has its OWN token, deliberately not MATRIX_ADMIN_TOKEN: that token "may belong
// to a regular user, not a dedicated service account" (matrix-simple/rooms.ts), so
// reusing it would post board notifications under a real person's name and make the audit
// trail a lie.
//
// The DM is ONE-WAY. Nothing in this codebase reads the bot's inbox — receiving would
// mean registering an application service on a homeserver bkaiser does not operate — so
// the room is created with the person unable to post, and the message body carries the
// deep link to where a decision is actually recorded. A composer the client greys out is
// honest; one that accepts replies nobody reads is not.

import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

import { MATRIX_HOMESERVER } from '../matrix-simple/shared';

export const matrixBotToken = defineSecret('MATRIX_BOT_TOKEN');

/**
 * The secret must EXIST for any function to deploy — Firebase validates every secret in
 * the codebase, not just the ones in the deployed function. So it is created with this
 * value until a real bot account is provisioned. Recognising it here turns "the bot was
 * never set up" into that sentence, instead of an opaque 401 from Synapse.
 */
const PLACEHOLDER = 'PLACEHOLDER-no-bot-account-yet';

/** Power level required to send in a bot DM: above the person's 0, at or below the bot's 100. */
const BOT_ONLY_EVENTS_DEFAULT = 50;

async function matrixFetch(path: string, init: RequestInit & { token: string }): Promise<Response> {
  const { token, ...rest } = init;
  return fetch(`${MATRIX_HOMESERVER}${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(rest.headers ?? {}) },
  });
}

/** The bot's own `m.direct` account data: Matrix already stores the person→room mapping. */
async function readDirectRooms(botUserId: string, token: string): Promise<Record<string, string[]>> {
  const resp = await matrixFetch(
    `/_matrix/client/v3/user/${encodeURIComponent(botUserId)}/account_data/m.direct`,
    { method: 'GET', token },
  );
  if (!resp.ok) return {};        // 404 = the bot has never had a DM
  return (await resp.json()) as Record<string, string[]>;
}

async function writeDirectRooms(botUserId: string, token: string, rooms: Record<string, string[]>): Promise<void> {
  await matrixFetch(
    `/_matrix/client/v3/user/${encodeURIComponent(botUserId)}/account_data/m.direct`,
    { method: 'PUT', token, body: JSON.stringify(rooms) },
  );
}

async function whoami(token: string): Promise<string> {
  const resp = await matrixFetch('/_matrix/client/v3/account/whoami', { method: 'GET', token });
  if (!resp.ok) throw new Error(`matrix bot whoami failed: ${await resp.text()}`);
  return ((await resp.json()) as { user_id: string }).user_id;
}

/**
 * The bot's DM with this person, created on first use.
 *
 * `power_level_content_override` is what makes it one-way: the bot keeps 100, everyone
 * else defaults to 0, and sending needs 50.
 *
 * No `m.room.encryption` in `initial_state`, and that is deliberate — see
 * `sendBotDirectMessage`. The 1.33 cutover pass must skip these rooms.
 */
async function ensureDirectRoom(botUserId: string, matrixUserId: string, token: string): Promise<string> {
  const direct = await readDirectRooms(botUserId, token);
  const existing = direct[matrixUserId]?.[0];
  if (existing) return existing;

  const resp = await matrixFetch('/_matrix/client/v3/createRoom', {
    method: 'POST',
    token,
    body: JSON.stringify({
      preset: 'trusted_private_chat',
      is_direct: true,
      invite: [matrixUserId],
      power_level_content_override: {
        users: { [botUserId]: 100 },
        events_default: BOT_ONLY_EVENTS_DEFAULT,
      },
    }),
  });
  if (!resp.ok) throw new Error(`matrix bot createRoom failed: ${await resp.text()}`);
  const roomId = ((await resp.json()) as { room_id: string }).room_id;

  await writeDirectRooms(botUserId, token, { ...direct, [matrixUserId]: [roomId] });
  logger.info(`matrix-bot: opened DM ${roomId} with ${matrixUserId}`);
  return roomId;
}

/**
 * Send one notice into the bot's DM with `matrixUserId`.
 *
 * `m.notice` rather than `m.text` — this is machine-generated, and Matrix clients treat
 * notices as such (no bot loops, quieter styling).
 *
 * `txnId` is deterministic per (rule, event, subject), so a retried invocation is deduped
 * by Synapse. A genuinely re-fired event days later is NOT covered.
 *
 * ⚠️ `body` MUST stay pointer-only — a hint plus the deep link, never the substance (no
 * amounts, no reason text, no third-party names). Decided 2026-08-15: bot DMs are exempt
 * from the 1.33 E2EE cutover (the bot has no crypto and `ensureDirectRoom` deliberately
 * omits `m.room.encryption`), so this room is readable by the homeserver operator. The
 * body comes from the rule's `actionArg`, so this is a rule-authoring rule, not something
 * enforceable here — see the approval-workflow spec §2.3a.
 */
export async function sendBotDirectMessage(matrixUserId: string, body: string, txnId: string): Promise<void> {
  const token = matrixBotToken.value();
  if (!token || token === PLACEHOLDER) {
    throw new Error('MATRIX_BOT_TOKEN is not configured — provision the bot account and set the secret before enabling a sendMessage rule');
  }

  const botUserId = await whoami(token);
  const roomId = await ensureDirectRoom(botUserId, matrixUserId, token);

  const resp = await matrixFetch(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
    { method: 'PUT', token, body: JSON.stringify({ msgtype: 'm.notice', body }) },
  );
  if (!resp.ok) throw new Error(`matrix bot send failed: ${await resp.text()}`);
}
