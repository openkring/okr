#!/usr/bin/env node
// Spike R6 (travel journal plan 1, spec 1.113 §8.2): send ONE Signal message through the Matrix
// mautrix-signal bridge, as Bruno's Matrix account (which is logged into the bridge with his
// personal Signal account).
//
//   MATRIX_HOMESERVER=https://matrix.example.org \
//   MATRIX_ACCESS_TOKEN=… \
//   SIGNAL_TEST_NUMBER=+41791234567 \
//   node scripts/journal-signal-spike.mjs [--bot @signalbot:example.org] [--text "…"]
//
// Never commit the token or the number. Steps:
//   1. whoami — confirms the token's Matrix user.
//   2. Open (or reuse) the DM portal for the number. mautrix-signal (bridgev2) exposes the
//      provisioning API `GET /_matrix/provision/v3/resolve_identifier/{id}` and
//      `POST /_matrix/provision/v3/create_dm/{id}` on the bridge's appservice; when that is not
//      reachable, the fallback sends `start-chat <number>` to the bridge bot's management room
//      and waits for the portal room invite.
//   3. Send m.text into the portal room.

const homeserver = process.env.MATRIX_HOMESERVER?.replace(/\/+$/, '');
const token = process.env.MATRIX_ACCESS_TOKEN;
const number = process.env.SIGNAL_TEST_NUMBER;
const provisioningUrl = process.env.SIGNAL_PROVISIONING_URL?.replace(/\/+$/, ''); // optional, e.g. https://matrix.example.org/_matrix/provision
const args = process.argv.slice(2);
const botArg = args.indexOf('--bot');
const textArg = args.indexOf('--text');
const text = textArg >= 0 ? args[textArg + 1] : 'Test aus dem Reisetagebuch';

if (!homeserver || !token || !number || !/^\+[1-9]\d{6,14}$/.test(number)) {
  console.error('Set MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN and SIGNAL_TEST_NUMBER (E.164, e.g. +41791234567).');
  process.exit(1);
}

async function matrix(method, path, body) {
  const res = await fetch(`${homeserver}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function viaProvisioning(userId) {
  if (!provisioningUrl) return undefined;
  const headers = { Authorization: `Bearer ${token}` };
  const id = encodeURIComponent(number);
  const resolved = await fetch(`${provisioningUrl}/v3/resolve_identifier/${id}?user_id=${encodeURIComponent(userId)}`, { headers });
  console.log('resolve_identifier:', resolved.status, await resolved.clone().text());
  if (!resolved.ok) return undefined;
  const created = await fetch(`${provisioningUrl}/v3/create_dm/${id}?user_id=${encodeURIComponent(userId)}`, { method: 'POST', headers });
  const body = await created.json().catch(() => ({}));
  console.log('create_dm:', created.status, JSON.stringify(body));
  return body.dm_room_mxid ?? body.room_id;
}

async function viaBotCommand(bot) {
  // find the management room: a joined DM with the bridge bot
  const { joined_rooms: rooms } = await matrix('GET', '/_matrix/client/v3/joined_rooms');
  let management;
  for (const roomId of rooms) {
    const members = await matrix('GET', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`).catch(() => ({ joined: {} }));
    const ids = Object.keys(members.joined ?? {});
    if (ids.length === 2 && ids.includes(bot)) { management = roomId; break; }
  }
  if (!management) throw new Error(`no management room with ${bot} found`);
  const since = (await matrix('GET', '/_matrix/client/v3/sync?timeout=0&filter={"room":{"timeline":{"limit":1}}}')).next_batch;
  await matrix('PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(management)}/send/m.room.message/spike-${Date.now()}`, { msgtype: 'm.text', body: `start-chat ${number}` });
  console.log(`sent "start-chat ${number}" to ${management}, waiting for the portal …`);
  for (let i = 0; i < 10; i++) {
    const sync = await matrix('GET', `/_matrix/client/v3/sync?timeout=3000&since=${since}`);
    const invited = Object.keys(sync.rooms?.invite ?? {});
    const joined = Object.keys(sync.rooms?.join ?? {}).filter((r) => r !== management);
    const reply = sync.rooms?.join?.[management]?.timeline?.events?.find((e) => e.sender === bot)?.content?.body;
    if (reply) console.log('bot:', reply);
    const roomId = invited[0] ?? joined[0];
    if (roomId) {
      if (invited.includes(roomId)) await matrix('POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`, {});
      return roomId;
    }
  }
  throw new Error('no portal room appeared within 30 s');
}

const me = await matrix('GET', '/_matrix/client/v3/account/whoami');
console.log('matrix user:', me.user_id);
const server = me.user_id.split(':')[1];
const bot = botArg >= 0 ? args[botArg + 1] : `@signalbot:${server}`;

const started = Date.now();
const roomId = (await viaProvisioning(me.user_id)) ?? (await viaBotCommand(bot));
console.log('portal room:', roomId, `(${Date.now() - started} ms)`);
await matrix('PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/journal-${Date.now()}`, { msgtype: 'm.text', body: text });
console.log('sent. Check Signal on the test phone; run again to confirm the same room is reused.');
