// apps/functions/src/matrix-simple/notes-room.ts
//
// «Notizen an mich»: the personal Matrix room that holds a person's chat bookmarks
// (spec 1.104 §3.1–3.2). One room per (person, tenant), created by @bk2-bot, identified
// solely by its alias `#notes_<tenantId>_<personKey>` — nothing is persisted in Firestore.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  OKR_TENANT_EVENT,
  requireParam,
  requireProvisionedUser,
  requireUserPersonKey,
  getUserTenants,
  getRoomTenantMarker,
  checkRateLimit,
  ensureMatrixUserExists,
  forceJoinUserToRoom,
  ensureAdminInRoom,
  resolveRoomAlias,
  notesRoomAliasLocalpart,
  serverHostname,
  getRoomSummary,
} from './shared';

/**
 * Power level of the room's owner. 50 may post (events_default 0) and redact (redact 50), but
 * every reshaping action — invite/kick/ban and all state, incl. the room name, the canonical
 * alias and the org.okr.tenant marker — needs 100, which only @bk2-bot holds (see
 * notesRoomPowerLevels). The private_chat preset alone would let 50 do all of that.
 */
const NOTES_PERSON_POWER_LEVEL = 50;
const NOTES_BOT_POWER_LEVEL = 100;

/** `power_level_content_override` of a notes room: the owner may write and redact, nothing else. */
export function notesRoomPowerLevels(botUserId: string, ownerUserId: string): Record<string, unknown> {
  const admin = NOTES_BOT_POWER_LEVEL;
  return {
    users: { [botUserId]: NOTES_BOT_POWER_LEVEL, [ownerUserId]: NOTES_PERSON_POWER_LEVEL },
    invite: admin,
    kick: admin,
    ban: admin,
    redact: 50,
    state_default: admin,
    events_default: 0,
    events: {
      'm.room.name': admin,
      'm.room.canonical_alias': admin,
      'm.room.avatar': admin,
      'm.room.topic': admin,
      'm.room.power_levels': admin,
      'm.room.history_visibility': admin,
      'm.room.join_rules': admin,
      'm.room.encryption': admin,
      'm.room.tombstone': admin,
      'm.room.server_acl': admin,
      [OKR_TENANT_EVENT]: admin,
    },
  };
}

/** The tenant the client names must be one of the caller's own (never `tenants[0]`). */
export function assertCallerTenant(tenantId: unknown, callerTenants: string[]): string {
  const tenant = requireParam(tenantId, 'tenantId', 50);
  if (!callerTenants.includes(tenant)) {
    throw new HttpsError('permission-denied', 'Not a member of this tenant.');
  }
  return tenant;
}

/**
 * Kiosk-only users (`roles.kiosk` and no other true role — mirrors `isKioskOnly` in
 * @okr/shared-util-core) get no bookmarks.
 */
export function assertNotKioskOnly(roles: Record<string, unknown> | undefined): void {
  if (!roles || roles['kiosk'] !== true) return;
  if (Object.entries(roles).every(([key, value]) => key === 'kiosk' || value !== true)) {
    throw new HttpsError('permission-denied', 'Kiosk users have no notes room.');
  }
}

/** The Matrix id of the admin-token account (@bk2-bot). Throws when whoami fails. */
export async function fetchBotUserId(adminToken: string): Promise<string> {
  const who = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const userId = who.ok ? ((await who.json()) as { user_id?: string }).user_id : undefined;
  if (!userId) throw new Error(`whoami → ${who.status}`);
  return userId;
}

/** Idempotent: provision the person's account and force-join them (repairs a half-created or left room). */
async function joinPerson(roomId: string, matrixUserId: string, personKey: string, adminToken: string): Promise<void> {
  await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });
  await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
}

/** A notes room is ours when @bk2-bot (the admin token's account) created it and it carries exactly [tenantId]. */
export async function isOwnNotesRoom(
  roomId: string, tenantId: string, adminToken: string, opts: { strict?: boolean; botUserId?: string } = {},
): Promise<boolean> {
  const headers = { Authorization: `Bearer ${adminToken}` };
  // strict (reminder sweep): a failed read throws so the caller retries; only a successful read
  // showing a foreign creator / wrong marker (or a 404 room) is a «no». Non-strict fails closed.
  const fail = (what: string, status: number): false => {
    if (opts.strict) throw new Error(`isOwnNotesRoom ${what} ${roomId} → ${status}`);
    return false;
  };
  try {
    let botId = opts.botUserId;
    if (!botId) {
      const who = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`, { headers });
      if (!who.ok) return fail('whoami', who.status);
      botId = ((await who.json()) as { user_id?: string }).user_id;
    }
    const details = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`, { headers });
    if (details.status === 404) return false;
    if (!details.ok) return fail('details', details.status);
    const creator = ((await details.json()) as { creator?: string }).creator;
    if (!botId || creator !== botId) return false;
    const marker = await getRoomTenantMarker(roomId, adminToken, { strict: opts.strict });
    return marker?.length === 1 && marker[0] === tenantId;
  } catch (error) {
    if (opts.strict) throw error;
    return false;
  }
}

/** What the tenant-admin room tools need to know about a room to decide whether it is a notes room. */
export interface NotesRoomFacts {
  roomId: string;
  canonicalAlias: string | null | undefined;
  creator: string | null | undefined;
  /** `m.room.power_levels` → `users`. */
  powerUsers: Record<string, number> | undefined;
  marker: string[] | undefined;
  /** Where the canonical alias resolves in the room directory. */
  aliasRoomId: string | undefined;
}

/**
 * Whether a room is a genuine «Notizen an mich» room — the only kind the tenant-admin room tools
 * (list, read, delete) skip. A `#notes_` alias alone proves nothing: any member can create a room,
 * stamp the tenant marker (the app's own client does) and give it a `#notes_…` alias to escape
 * moderation. The decision rests only on facts the owner cannot change (all state needs power
 * level 100 in a notes room, see notesRoomPowerLevels) — never on current membership, so an owner
 * who leaves does not expose their notes:
 *   - @bk2-bot created the room,
 *   - the marker names exactly one tenant,
 *   - the power-level users are exactly the bot at 100 and one person at 50 (the owner),
 *   - the canonical alias is exactly that owner's notes alias for that tenant on the bot's server,
 *   - and that alias resolves back to this room.
 */
export function isGenuineNotesRoom(facts: NotesRoomFacts, botUserId: string): boolean {
  const server = botUserId.split(':').slice(1).join(':');
  if (!server || facts.creator !== botUserId) return false;
  if (facts.marker?.length !== 1) return false;
  const users = Object.entries(facts.powerUsers ?? {});
  if (users.length !== 2) return false;
  if (!users.some(([id, level]) => id === botUserId && level === NOTES_BOT_POWER_LEVEL)) return false;
  const owner = users.find(([id, level]) => id !== botUserId && level === NOTES_PERSON_POWER_LEVEL)?.[0];
  if (!owner?.startsWith('@')) return false;
  const colon = owner.indexOf(':');
  if (colon < 0 || owner.slice(colon + 1) !== server) return false;
  const alias = `#${notesRoomAliasLocalpart(facts.marker[0], owner.slice(1, colon))}:${server}`;
  return facts.canonicalAlias === alias && facts.aliasRoomId === facts.roomId;
}

/**
 * Whether `roomId` (whose canonical alias the caller already knows) is a genuine notes room.
 * Only a `#notes_` alias triggers the lookups; every other room is moderatable without them.
 * A failed lookup throws — callers decide whether that fails open (listing) or closed (read/delete).
 */
export async function isPersonalNotesRoom(
  roomId: string, canonicalAlias: string | null | undefined, adminToken: string, botUserId: string,
): Promise<boolean> {
  if (typeof canonicalAlias !== 'string' || !canonicalAlias.startsWith('#notes_')) return false;
  const summary = await getRoomSummary(roomId, adminToken);
  if (!summary) throw new Error(`isPersonalNotesRoom: no details for ${roomId}`);
  const stateResp = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!stateResp.ok) throw new Error(`isPersonalNotesRoom: state ${stateResp.status} for ${roomId}`);
  const events = ((await stateResp.json()) as { state?: Array<{ type: string; state_key: string; content: Record<string, unknown> }> }).state ?? [];
  const content = (type: string) => events.find((e) => e.type === type && e.state_key === '')?.content;
  const powerUsers = content('m.room.power_levels')?.['users'] as Record<string, number> | undefined;
  const tenants = content(OKR_TENANT_EVENT)?.['tenants'];
  const marker = Array.isArray(tenants) ? tenants.map(String) : undefined;
  const aliasRoomId = await resolveRoomAlias(canonicalAlias, adminToken, { strict: true });
  return isGenuineNotesRoom({ roomId, canonicalAlias, creator: summary.creator, powerUsers, marker, aliasRoomId }, botUserId);
}

/**
 * Throw unless `roomId` may be managed by the tenant-admin room tools. Fails closed: when a room
 * that looks like a notes room cannot be checked, the tool refuses rather than risk exposing it.
 */
export async function requireNotPersonalNotesRoom(roomId: string, fnName: string, adminToken: string): Promise<void> {
  const summary = await getRoomSummary(roomId, adminToken);
  if (!summary) throw new HttpsError('unavailable', 'Room details are not available right now.');
  if (!summary.canonicalAlias.startsWith('#notes_')) return;
  let personal: boolean;
  try {
    personal = await isPersonalNotesRoom(roomId, summary.canonicalAlias, adminToken, await fetchBotUserId(adminToken));
  } catch (error) {
    console.warn(`${fnName}: notes-room check failed for ${roomId}`, error);
    throw new HttpsError('unavailable', 'Room details are not available right now.');
  }
  if (personal) {
    console.warn(`${fnName}: refused on personal notes room ${roomId}`);
    throw new HttpsError('permission-denied', 'This room cannot be managed here.');
  }
}

/**
 * Find or create the notes room of `personKey` in `tenantId` and return its room id.
 * Creation: private, `history_visibility: joined`, tenant marker, person at power level 50,
 * person force-joined. A concurrent create (`M_ROOM_IN_USE`) resolves to the winner's room.
 */
export async function ensureNotesRoom(
  tenantId: string,
  personKey: string,
  hostname: string,
  adminToken: string,
): Promise<string> {
  const localpart = notesRoomAliasLocalpart(tenantId, personKey);
  const alias = `#${localpart}:${hostname}`;

  const matrixUserId = `@${personKey.toLowerCase()}:${hostname}`;

  const existing = await resolveRoomAlias(alias, adminToken);
  if (existing) {
    if (await isOwnNotesRoom(existing, tenantId, adminToken)) {
      await joinPerson(existing, matrixUserId, personKey, adminToken);
      return existing;
    }
    // Alias squatting: someone else claimed `#notes_<tenant>_<person>`. Release the alias
    // and create our own room; never hand out (or post bookmarks into) a foreign room.
    console.warn(`resolveNotesRoom: ${alias} -> ${existing} is not our room; removing the alias`);
    await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }

  const botUserId = await fetchBotUserId(adminToken);
  const createResp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // The stored name is the alias localpart (spec §3.1); the app shows a localised name.
      name: localpart,
      room_alias_name: localpart,
      preset: 'private_chat',
      visibility: 'private',
      creation_content: { 'm.federate': false },
      initial_state: [
        { type: OKR_TENANT_EVENT, state_key: '', content: { tenants: [tenantId] } },
        { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
      ],
      power_level_content_override: notesRoomPowerLevels(botUserId, matrixUserId),
    }),
  });
  if (!createResp.ok) {
    const errText = await createResp.text();
    if (errText.includes('M_ROOM_IN_USE')) {
      const raced = await resolveRoomAlias(alias, adminToken);
      if (raced && (await isOwnNotesRoom(raced, tenantId, adminToken))) {
        await joinPerson(raced, matrixUserId, personKey, adminToken);
        return raced;
      }
    }
    throw new HttpsError('internal', `Failed to create notes room ${alias}: ${errText}`);
  }
  const roomId = ((await createResp.json()) as { room_id: string }).room_id;

  await ensureAdminInRoom(roomId, adminToken);
  await joinPerson(roomId, matrixUserId, personKey, adminToken);
  console.log(`resolveNotesRoom: created ${roomId} (${alias})`);
  return roomId;
}

/** Resolve (find or create) the caller's «Notizen an mich» room for one of their tenants. */
export const resolveNotesRoom = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string }> => {
    const uid = await requireProvisionedUser(request, 'resolveNotesRoom');
    checkRateLimit(uid, 'resolveNotesRoom', 10);

    const tenant = assertCallerTenant(
      (request.data as { tenantId?: string } | undefined)?.tenantId,
      await getUserTenants(uid),
    );

    const userDoc = await getFirestore().collection('users').doc(uid).get();
    assertNotKioskOnly(userDoc.data()?.['roles'] as Record<string, unknown> | undefined);

    const personKey = await requireUserPersonKey(uid, 'resolveNotesRoom');
    const roomId = await ensureNotesRoom(tenant, personKey, serverHostname(), matrixAdminToken.value());
    return { roomId };
  },
);
