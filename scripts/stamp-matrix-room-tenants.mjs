/**
 * STAMP THE `org.okr.tenant` MARKER ON MATRIX ROOMS THAT THE BACKFILL CANNOT REACH.
 * Dry run by default, idempotent, re-runnable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * One person has ONE Matrix account across every tenant, so the joined-room list is identical
 * in every app. Tenant separation is a client-side filter over the `org.okr.tenant` room-state
 * marker (`filterRoomsOfTenant` in `@okr/chat-util`). Its last rule keeps any room it cannot
 * classify, because hiding an unclassifiable room would lose a conversation. The price is that
 * a room with NO marker, NO `#group_…` alias and NO DM counterpart is visible in EVERY tenant.
 *
 * The `backfillMatrixRoomTenants` Cloud Function stamps rooms it can map onto a `groups` doc.
 * Rooms created ad hoc from a chat client map onto no group at all — the function reports them
 * as `ambiguous` and deliberately refuses to guess. Those are exactly the rooms that leak, and
 * this script is the manual counterpart: a human decides the tenant, the script writes it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * HOW
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Two phases, so the human decision is made on paper and not inside a loop:
 *
 *   1. `audit`  — lists every room with no marker and writes a TSV plan. Each row is
 *                 `roomId <TAB> tenant <TAB> name <TAB> alias <TAB> members <TAB> localparts`,
 *                 with `tenant` left EMPTY for you to fill in. Rooms that the filter already
 *                 places by alias or as a DM are listed too, marked `[ok:…]`, so you can see
 *                 that leaving them unmarked is safe.
 *   2. `stamp`  — reads the TSV back and PUTs the marker on every row that carries a tenant.
 *                 Rows with an empty tenant are skipped, so a partially filled plan is fine.
 *
 * DMs are never stamped — labelling one would mean force-joining the admin bot into a private
 * two-person conversation. They are classified client-side from the counterpart instead.
 *
 * Writing room state needs power in the room, so the script reuses the Cloud Function's
 * escalation path (`ensureAdminInRoom` in `apps/functions/src/matrix-simple/shared.ts`):
 * admin-join, and on 403 `make_room_admin` first. "…is already in the room" is success.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   export MATRIX_ADMIN_TOKEN=$(gcloud secrets versions access latest \
 *     --secret=MATRIX_ADMIN_TOKEN --project bkaiser-org)
 *
 *   node scripts/stamp-matrix-room-tenants.mjs audit --out /tmp/rooms.tsv
 *   # …open /tmp/rooms.tsv, fill in the tenant column (scs, elab, p13, …)
 *   node scripts/stamp-matrix-room-tenants.mjs stamp --in /tmp/rooms.tsv            # dry run
 *   node scripts/stamp-matrix-room-tenants.mjs stamp --in /tmp/rooms.tsv --execute  # writes
 *
 * Never put the token in a file and never echo it.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const HOMESERVER = process.env.MATRIX_HOMESERVER ?? 'https://matrix.bkchat.etke.host';
const SERVER_NAME = process.env.MATRIX_SERVER_NAME ?? 'bkchat.etke.host';
const BOT_USER_ID = process.env.MATRIX_BOT_USER_ID ?? `@bk2-bot:${SERVER_NAME}`;
const OKR_TENANT_EVENT = 'org.okr.tenant';

const token = process.env.MATRIX_ADMIN_TOKEN;
if (!token) {
  console.error('MATRIX_ADMIN_TOKEN is not set. See the USAGE block at the top of this file.');
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const execute = args.includes('--execute');

async function call(method, path, body) {
  const res = await fetch(HOMESERVER + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

const enc = (roomId) => encodeURIComponent(roomId);

/** Every room on the homeserver, paged. */
async function listRooms() {
  const rooms = [];
  let from = 0;
  for (;;) {
    const { ok, json } = await call('GET', `/_synapse/admin/v1/rooms?limit=100&from=${from}`);
    if (!ok) throw new Error(`listRooms failed: ${JSON.stringify(json)}`);
    rooms.push(...(json.rooms ?? []));
    if (json.next_batch === undefined) return rooms;
    from = json.next_batch;
  }
}

async function readMarker(roomId) {
  const { ok, json } = await call('GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/${OKR_TENANT_EVENT}/`);
  return ok && Array.isArray(json.tenants) && json.tenants.length ? json.tenants : undefined;
}

/** Joined member localparts — the strongest hint for which tenant an ad-hoc room belongs to. */
async function memberLocalparts(roomId) {
  const { ok, json } = await call('GET', `/_synapse/admin/v1/rooms/${enc(roomId)}/members`);
  if (!ok) return [];
  return (json.members ?? []).map((m) => m.split(':')[0].replace(/^@/, ''));
}

/**
 * Give the bot power to write state, mirroring `ensureAdminInRoom` in the Cloud Functions.
 * A 403 on join means the bot is not privileged in the room yet — `make_room_admin` fixes that.
 */
async function ensureAdminInRoom(roomId) {
  const join = await call('POST', `/_synapse/admin/v1/join/${enc(roomId)}`, { user_id: BOT_USER_ID });
  if (join.ok) return true;
  if (join.json?.error?.includes('already in the room')) return true;
  const promote = await call('POST', `/_synapse/admin/v1/rooms/${enc(roomId)}/make_room_admin`, { user_id: BOT_USER_ID });
  if (!promote.ok && !promote.json?.error?.includes('already')) {
    console.warn(`  make_room_admin failed: ${JSON.stringify(promote.json)}`);
    return false;
  }
  const retry = await call('POST', `/_synapse/admin/v1/join/${enc(roomId)}`, { user_id: BOT_USER_ID });
  return retry.ok || !!retry.json?.error?.includes('already in the room');
}

async function audit() {
  const out = flag('--out', '/tmp/matrix-room-tenants.tsv');
  const rooms = await listRooms();
  console.log(`${rooms.length} rooms on ${SERVER_NAME}\n`);

  const lines = [
    '# Fill in the tenant column, then: node scripts/stamp-matrix-room-tenants.mjs stamp --in <this file> --execute',
    '# Rows marked [ok:…] are already placed by the client filter and need no marker — leave them empty.',
    '# roomId\ttenant\tname\talias\tmembers\tlocalparts',
  ];
  let leaking = 0;

  for (const room of rooms) {
    const tenants = await readMarker(room.room_id);
    if (tenants) continue; // already marked — nothing to decide

    const alias = room.canonical_alias ?? '';
    const members = room.joined_members ?? 0;
    const locals = await memberLocalparts(room.room_id);

    // Mirror the filter's rules 2 and 3: an alias-bearing group room and a two-person DM are
    // both classified without a marker, so they are not part of the leak.
    let placed;
    if (alias.startsWith('#group_')) placed = 'alias';
    else if (members === 2 && !room.name) placed = 'dm';

    if (placed) {
      lines.push(`# [ok:${placed}] ${room.room_id}\t\t${room.name ?? ''}\t${alias}\t${members}\t${locals.join(',')}`);
      continue;
    }

    leaking++;
    lines.push(`${room.room_id}\t\t${room.name ?? ''}\t${alias}\t${members}\t${locals.join(',')}`);
    console.log(`LEAKS  ${String(room.name ?? '(unnamed)').padEnd(34)} m=${String(members).padEnd(4)} ${room.room_id}`);
  }

  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`\n${leaking} unmarked rooms are visible in EVERY tenant.`);
  console.log(`Plan written to ${out} — fill in the tenant column, then run the stamp command.`);
}

async function stamp() {
  const input = flag('--in', '/tmp/matrix-room-tenants.tsv');
  const rows = readFileSync(input, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .map(([roomId, tenant, name]) => ({ roomId, tenant: (tenant ?? '').trim(), name: name ?? '' }))
    .filter((r) => r.tenant);

  if (!rows.length) {
    console.log(`No row in ${input} carries a tenant — nothing to do.`);
    return;
  }
  console.log(`${execute ? 'STAMPING' : 'DRY RUN —'} ${rows.length} rooms\n`);

  let done = 0;
  for (const { roomId, tenant, name } of rows) {
    const existing = await readMarker(roomId);
    if (existing?.includes(tenant)) {
      console.log(`  skip  ${name || roomId} — already ${JSON.stringify(existing)}`);
      continue;
    }
    if (existing) console.log(`  NOTE  ${name || roomId} carries ${JSON.stringify(existing)} — overwriting with ['${tenant}']`);
    if (!execute) {
      console.log(`  would ${roomId} → ['${tenant}']  ${name}`);
      continue;
    }
    if (!(await ensureAdminInRoom(roomId))) {
      console.warn(`  FAIL  ${roomId} — could not obtain power to write state`);
      continue;
    }
    const put = await call('PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/${OKR_TENANT_EVENT}/`, { tenants: [tenant] });
    if (put.ok) { done++; console.log(`  ok    ${roomId} → ['${tenant}']  ${name}`); }
    else console.warn(`  FAIL  ${roomId}: ${JSON.stringify(put.json)}`);
  }

  console.log(`\n${execute ? `${done} rooms stamped.` : 'Dry run — re-run with --execute to write.'}`);
}

if (command === 'audit') await audit();
else if (command === 'stamp') await stamp();
else {
  console.error('Usage: stamp-matrix-room-tenants.mjs <audit|stamp> [--out FILE|--in FILE] [--execute]');
  process.exit(1);
}
