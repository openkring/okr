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
} from './shared';

/** Power level of the room's owner: may post and redact, but cannot reshape the room. */
const NOTES_PERSON_POWER_LEVEL = 50;

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

/** Idempotent: provision the person's account and force-join them (repairs a half-created or left room). */
async function joinPerson(roomId: string, matrixUserId: string, personKey: string, adminToken: string): Promise<void> {
  await ensureMatrixUserExists(matrixUserId, adminToken, { personKey });
  await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
}

/** A notes room is ours when @bk2-bot (the admin token's account) created it and it carries exactly [tenantId]. */
export async function isOwnNotesRoom(roomId: string, tenantId: string, adminToken: string): Promise<boolean> {
  const headers = { Authorization: `Bearer ${adminToken}` };
  try {
    const who = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami`, { headers });
    if (!who.ok) return false;
    const botId = ((await who.json()) as { user_id?: string }).user_id;
    const details = await fetch(`${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`, { headers });
    if (!details.ok) return false;
    const creator = ((await details.json()) as { creator?: string }).creator;
    if (!botId || creator !== botId) return false;
    const marker = await getRoomTenantMarker(roomId, adminToken);
    return marker?.length === 1 && marker[0] === tenantId;
  } catch {
    return false;
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

  const createResp = await fetch(`${MATRIX_HOMESERVER}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Notizen an mich',
      room_alias_name: localpart,
      preset: 'private_chat',
      visibility: 'private',
      creation_content: { 'm.federate': false },
      initial_state: [
        { type: OKR_TENANT_EVENT, state_key: '', content: { tenants: [tenantId] } },
        { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
      ],
      power_level_content_override: { users: { [matrixUserId]: NOTES_PERSON_POWER_LEVEL } },
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
