// apps/functions/src/matrix-simple/tenant-backfill.ts
//
// One-off (re-runnable) backfill of the `org.okr.tenant` room-state marker.
//
// A person has ONE Matrix account across every tenant, so a room only belongs to a tenant
// if it says so. Rooms created from now on are stamped at creation (resolveGroupRoom for
// group rooms, MatrixChatService for rooms created in-app); this function stamps the GROUP
// rooms that already existed before the marker was introduced. DMs are out of scope by
// design — see the doc comment on the function.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireRole,
  groupRoomAliasLocalpart,
  getRoomTenants,
  setRoomTenants,
} from './shared';

interface BackfillResult {
  /** rooms stamped in this run */
  stamped: number;
  /** rooms that already carried a marker */
  alreadyMarked: number;
  /** rooms whose tenants could not be determined — left unmarked, i.e. visible everywhere */
  ambiguous: string[];
  /** roomId → tenants written (dryRun: would be written) */
  changes: Record<string, string[]>;
  /** roomId → room name, so the preview can name a room instead of only its opaque id */
  names: Record<string, string>;
  dryRun: boolean;
}

/**
 * Stamp every existing GROUP room with the tenants of its group.
 *
 * Group rooms only, deliberately. Writing room state requires the admin bot to be a member,
 * and it already belongs in a group room — but force-joining it into someone's DM to label
 * that DM would add a bot to a private two-person conversation and stop Matrix from treating
 * it as a DM at all. DMs are therefore never stamped; the client decides their tenant from
 * the other member instead (see `filterRoomsOfTenant` in `@okr/chat-util`), which needs no
 * room state and no bot.
 *
 * A room that matches no group is reported in `ambiguous` and left unmarked, i.e. it stays
 * visible everywhere. The backfill never hides a room it did not understand.
 *
 * Idempotent: rooms that already carry a marker are skipped, so a re-run only picks up what
 * is new. Call with `{ dryRun: true }` first to see what it would do.
 */
export const backfillMatrixRoomTenants = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
    timeoutSeconds: 540,
  },
  async (request): Promise<BackfillResult> => {
    await requireRole(request, 'backfillMatrixRoomTenants', ['admin']);

    const { dryRun = false } = (request.data ?? {}) as { dryRun?: boolean };
    const adminToken = matrixAdminToken.value();
    const db = getFirestore();

    // --- Firestore side: group rooms by alias localpart and by persisted matrixRoomId ---
    const groupsSnap = await db.collection('groups').get();
    const tenantsByAlias = new Map<string, string[]>();
    const tenantsByRoomId = new Map<string, string[]>();
    for (const doc of groupsSnap.docs) {
      const tenants = (doc.data()['tenants'] as string[] | undefined) ?? [];
      if (!tenants.length) continue;
      tenantsByAlias.set(groupRoomAliasLocalpart(doc.id), tenants);
      const roomId = doc.data()['matrixRoomId'] as string | undefined;
      if (roomId) tenantsByRoomId.set(roomId, tenants);
    }

    // --- Matrix side: every room on the homeserver ---
    const rooms: Array<{ roomId: string; canonicalAlias?: string; name?: string }> = [];
    let from = 0;
    for (;;) {
      const resp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?limit=100&from=${from}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      if (!resp.ok) throw new HttpsError('internal', `Failed to list rooms: ${await resp.text()}`);
      const data = await resp.json() as {
        rooms: Array<{ room_id: string; canonical_alias?: string; name?: string }>;
        next_batch?: number;
      };
      for (const r of data.rooms) rooms.push({ roomId: r.room_id, canonicalAlias: r.canonical_alias, name: r.name });
      if (!data.next_batch || rooms.length >= 1000) break;
      from = data.next_batch;
    }

    const result: BackfillResult = { stamped: 0, alreadyMarked: 0, ambiguous: [], changes: {}, names: {}, dryRun };

    // Joining the admin into a room it isn't in costs a rate-limited make_room_admin call
    // (~1/minute, see ensureAdminInRoom), so a run over many such rooms would hit the 540s
    // function timeout. Stop early instead and let the operator press the button again — the
    // whole thing is idempotent, and a partial run is progress, not damage.
    const startedAt = Date.now();
    const deadlineMs = 420_000;

    for (const room of rooms) {
      if (!dryRun && Date.now() - startedAt > deadlineMs) {
        console.log(`backfillMatrixRoomTenants: stopping early after ${Math.round((Date.now() - startedAt) / 1000)}s — re-run to continue`);
        break;
      }
      if ((await getRoomTenants(room.roomId, adminToken)).length) {
        result.alreadyMarked++;
        continue;
      }

      // Group room: by canonical alias, or by the group's persisted matrixRoomId.
      // Lowercased: `groupRoomAliasLocalpart` lowercases the okey, but rooms created by an
      // older code path carry the okey's original case (`#group_Trainerteam`,
      // `#group_memberAdmin`, `#group_contentAdmin`). Comparing raw missed exactly those.
      const aliasLocalpart = room.canonicalAlias?.split(':')[0].replace(/^#/, '').toLowerCase();
      const tenants = (aliasLocalpart ? tenantsByAlias.get(aliasLocalpart) : undefined)
        ?? tenantsByRoomId.get(room.roomId);

      // Not a group room (DM/ad-hoc) → leave unmarked, report it
      if (!tenants?.length) {
        result.ambiguous.push(room.roomId);
        continue;
      }

      result.changes[room.roomId] = tenants;
      result.names[room.roomId] = room.name || room.canonicalAlias || '';
      if (!dryRun && await setRoomTenants(room.roomId, tenants, adminToken)) result.stamped++;
    }

    console.log(`backfillMatrixRoomTenants: ${rooms.length} rooms, stamped=${result.stamped}, ` +
      `alreadyMarked=${result.alreadyMarked}, ambiguous=${result.ambiguous.length}, dryRun=${dryRun}`);
    return result;
  }
);
