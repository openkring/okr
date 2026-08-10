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
 * PREREQUISITES
 *   gcloud auth login                       # to read the MATRIX_ADMIN_TOKEN secret
 *
 * USAGE
 *   # 1. list the kiosk account's rooms, to find the one shared with the admins
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey>
 *
 *   # 2. dry run: show the power levels that would be written
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey> --admins=<k1,k2> --room='!abc:server'
 *
 *   # 3. write it
 *   node scripts/set-kiosk-call-policy.mjs --kiosk=<personKey> --admins=<k1,k2> --room='!abc:server' --write
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
const roomId = value('room');

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
if (!roomId) {
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

const adminUserIds = adminKeys.map(mxid);
const stateUrl = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels/`;
const current = await call(stateUrl);

const users = { ...current.users };
for (const userId of adminUserIds) users[userId] = ADMIN_POWER_LEVEL;
users[kioskUserId] = 0; // the kiosk answers calls, it never places or moderates them

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
console.log(`kiosk  : ${kioskUserId} (power level 0)`);
console.log(`admins : ${adminUserIds.join(', ')} (power level ${ADMIN_POWER_LEVEL})`);
console.log(`\ncurrent power_levels:\n${JSON.stringify(current, null, 2)}`);
console.log(`\nwould write:\n${JSON.stringify(next, null, 2)}`);

if (!WRITE) {
  console.log('\nDry run. Add --write to apply.');
  process.exit(0);
}

await call(stateUrl, { method: 'PUT', body: JSON.stringify(next) });
console.log('\n✔ power levels written — only the named admins can ring this kiosk.');
