/**
 * Lock a kiosk's Matrix call room down to admins — the setup step behind the kiosk
 * auto-answer feature.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY A SCRIPT AND NOT THE CLOUD FUNCTION
 * ─────────────────────────────────────────────────────────────────────────────────────
 * `setKioskCallRoomPolicy` (apps/functions/src/matrix-simple/rooms.ts) does exactly this,
 * but it is an onCall with `enforceAppCheck: true` — it can only be reached from the app,
 * signed in as an admin, and there is no admin UI for it yet. This script performs the
 * same Matrix state write with the admin token, so a kiosk can be provisioned today.
 * When an AOC button exists, use the function and delete this script.
 *
 * WHAT IT WRITES: one `m.room.power_levels` state event, merged into whatever the room
 * already has — `m.call.invite` (and `m.call.candidates`) require PL 100, the named admins
 * get PL 100, the kiosk account gets 0. Synapse then rejects a call invite from anyone
 * else, which is the actual enforcement; the kiosk client's own check only mirrors it.
 *
 * ROOM VERSION 12 CAVEAT: creators hold implicit power that no power_levels event can
 * change, and the server rejects any event that even names them. A DM opened with the
 * TrustedPrivateChat preset (what createDirectRoom uses) makes BOTH parties creators, so
 * in such a room the admin needs no promotion and the kiosk cannot be demoted — the script
 * leaves creators out and says so. The gate still holds: nobody below creator/PL 100 can
 * ring the kiosk. For a room where the kiosk must be a plain member, create it with a
 * non-trusted preset instead of a DM.
 *
 * PREREQUISITES
 *   gcloud auth login                       # to read the MATRIX_ADMIN_TOKEN secret
 *
 * USAGE
 *   # 1. list the kiosk account's rooms, to find the one shared with the admins
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey>
 *
 *   # 2. dry run: show the power levels that would be written
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey> --admins=<k1,k2> --room='!abc123…'
 *
 *   # 3. write it
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey> --admins=<k1,k2> --room='!abc123…' --write
 *
 * personKeys are the `persons` document ids (the Matrix localpart is that key lowercased).
 * Re-running is safe and is how you add an admin later.
 */
import { execFileSync } from 'node:child_process';

const HOMESERVER = process.env.MATRIX_HOMESERVER || 'https://matrix.bkchat.etke.host';
const SERVER_NAME = new URL(HOMESERVER).hostname.replace('matrix.', '');
const ADMIN_POWER_LEVEL = 100; // keep in sync with KIOSK_CALLER_MIN_POWER_LEVEL (chat-data-access)

const ARGS = process.argv.slice(2);
const value = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const WRITE = ARGS.includes('--write');

const kioskKey = value('kiosk');
const adminKeys = (value('admins') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const roomArg = value('room');

if (!kioskKey) {
  console.error('Missing --kiosk=<personKey>. See the header of this file for usage.');
  process.exit(1);
}

const mxid = (personKey) => `@${personKey.toLowerCase()}:${SERVER_NAME}`;
const kioskUserId = mxid(kioskKey);

const token = execFileSync('gcloud',
  ['secrets', 'versions', 'access', 'latest', '--secret=MATRIX_ADMIN_TOKEN', '--project=bkaiser-org'],
  { encoding: 'utf8' },
).trim();
const authHeader = { Authorization: `Bearer ${token}` };

async function call(path, init = {}) {
  const resp = await fetch(`${HOMESERVER}${path}`, {
    ...init,
    headers: { ...authHeader, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${resp.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

/** Without --room: list the kiosk's rooms so the caller can pick the one to lock. */
if (!roomArg) {
  const { joined_rooms: rooms } = await call(`/_synapse/admin/v1/users/${encodeURIComponent(kioskUserId)}/joined_rooms`);
  console.log(`Rooms joined by ${kioskUserId}:\n`);
  for (const id of rooms ?? []) {
    let name = '(no name)';
    try {
      const details = await call(`/_synapse/admin/v1/rooms/${encodeURIComponent(id)}`);
      name = details.name || details.canonical_alias || `${details.joined_members} member(s)`;
    } catch { /* a room we cannot read is still worth listing by id */ }
    console.log(`  ${id}   ${name}`);
  }
  console.log('\nRe-run with --room=<roomId> --admins=<personKey,...> to see the dry run.');
  process.exit(0);
}

if (!adminKeys.length) {
  console.error('Missing --admins=<personKey,...> — at least one admin must keep power level 100.');
  process.exit(1);
}

/**
 * Room ids of recent room versions are a bare hash with NO ':server' suffix, so an id copied
 * with one appended resolves to nothing and every later call fails with a confusing
 * "can't join remote room". Accept both shapes: verify the id, and retry without the domain.
 */
async function resolveRoomId(candidate) {
  for (const id of [candidate, candidate.split(':')[0]]) {
    try {
      await call(`/_synapse/admin/v1/rooms/${encodeURIComponent(id)}`);
      if (id !== candidate) console.log(`note: '${candidate}' is unknown; using '${id}'`);
      return id;
    } catch { /* try the next shape */ }
  }
  throw new Error(`No room '${candidate}' on ${HOMESERVER}. Run without --room to list the kiosk's rooms.`);
}

const roomId = await resolveRoomId(roomArg);

/**
 * The admin token belongs to @bk2-bot, which is not a member of a DM between two members —
 * and Synapse refuses to read or write room state for a non-member. Join it first, exactly
 * as the ensureAdminInRoom helper behind setKioskCallRoomPolicy does: the admin-join API
 * works only for rooms the bot can already see, so an invite-only room needs the documented
 * make_room_admin escalation (a local member with power invites and promotes the bot) before
 * the join succeeds.
 */
async function ensureBotInRoom() {
  const { user_id: botUserId } = await call('/_matrix/client/v3/account/whoami');

  /** 'joined' — including when it already was — or 'forbidden', which needs the escalation. */
  const join = async () => {
    try {
      await call(`/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
        { method: 'POST', body: JSON.stringify({ user_id: botUserId }) });
      return 'joined';
    } catch (error) {
      const message = String(error);
      // Synapse answers a redundant join with 403 "already in the room" — that is success
      if (message.includes('already in the room')) return 'joined';
      if (message.includes('403')) return 'forbidden';
      throw error;
    }
  };

  if (await join() === 'joined') return botUserId;

  console.log(`${botUserId} is not in the room yet — escalating via make_room_admin…`);
  const promote = () => call(`/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`,
    { method: 'POST', body: JSON.stringify({ user_id: botUserId }) });
  try {
    await promote();
  } catch (error) {
    // Synapse rate-limits make_room_admin to about one call per minute
    const retryAfter = /retry_after_ms[":\s]+(\d+)/.exec(String(error))?.[1];
    if (!retryAfter) throw error;
    const waitMs = Math.min(Number(retryAfter) + 2_000, 90_000);
    console.log(`rate-limited, waiting ${Math.round(waitMs / 1000)}s…`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    await promote();
  }
  // make_room_admin only invites — the invite still has to be accepted
  if (await join() === 'forbidden') {
    throw new Error(`${botUserId} still cannot join ${roomId}. Is there a local member with power in it?`);
  }
  return botUserId;
}

const botUserId = await ensureBotInRoom();
console.log(`admin bot   : ${botUserId} (in room)`);

const adminUserIds = adminKeys.map(mxid);
const stateUrl = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels/`;
const current = await call(stateUrl);

/**
 * Room version 12 gave creators implicit, immutable power, and the server REJECTS a
 * power_levels event that mentions one ("Creator user … must not appear in content.users").
 * A DM opened with the TrustedPrivateChat preset makes BOTH parties creators, so in such a
 * room neither the admin needs promoting nor can the kiosk be demoted — leave them out.
 */
const { creator } = await call(`/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`);
const { additional_creators: additionalCreators } =
  await call(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.create/`);
const creators = new Set([creator, ...(additionalCreators ?? [])].filter(Boolean));

const users = { ...current.users };
for (const userId of adminUserIds) {
  if (creators.has(userId)) {
    console.log(`note: ${userId} is a room creator — implicit power, cannot be listed`);
    continue;
  }
  users[userId] = ADMIN_POWER_LEVEL;
}
// the kiosk answers calls, it never places or moderates them — unless it co-created the room
if (creators.has(kioskUserId)) {
  console.log(`WARNING: ${kioskUserId} is a room creator and keeps implicit power here, so it`);
  console.log('         can also place calls in this room. Admin-only ringing still holds:');
  console.log('         no one below creator/PL 100 can send m.call.invite after this write.');
} else {
  users[kioskUserId] = 0;
}

const next = {
  ...current,
  users,
  events: {
    ...current.events,
    'm.call.invite': ADMIN_POWER_LEVEL,
    'm.call.candidates': ADMIN_POWER_LEVEL,
    'm.room.power_levels': ADMIN_POWER_LEVEL,
  },
  invite: ADMIN_POWER_LEVEL,
  kick: ADMIN_POWER_LEVEL,
  ban: ADMIN_POWER_LEVEL,
};

console.log(`room   : ${roomId}`);
console.log(`kiosk  : ${kioskUserId} (${creators.has(kioskUserId) ? 'creator, implicit power' : 'power level 0'})`);
console.log(`admins : ${adminUserIds.map(id => `${id} (${creators.has(id) ? 'creator, implicit power' : `power level ${ADMIN_POWER_LEVEL}`})`).join(', ')}`);
console.log(`\ncurrent power_levels:\n${JSON.stringify(current, null, 2)}`);
console.log(`\nwould write:\n${JSON.stringify(next, null, 2)}`);

if (!WRITE) {
  console.log('\nDry run. Add --write to apply.');
  process.exit(0);
}

await call(stateUrl, { method: 'PUT', body: JSON.stringify(next) });
console.log('\n✔ power levels written — only the named admins can ring this kiosk.');
