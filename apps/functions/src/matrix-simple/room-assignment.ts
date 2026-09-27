// apps/functions/src/matrix-simple/room-assignment.ts
//
// Mandantenzuordnung eines einzelnen Raums von Hand — die Antwort auf «wie konfiguriere ich,
// welcher Bruecken-Raum zu welchem Mandanten gehoert».
//
// Warum es dafuer ein eigenes Werkzeug braucht: `backfillMatrixRoomTenants` kann es nicht und
// soll es nicht. Es leitet den Mandanten aus dem GRUPPENSCHLUESSEL ab (Alias oder
// `matrixRoomId`) und traegt bewusst nichts ein, was es nicht ableiten kann — solche Raeume
// landen in `ambiguous`. Ein von der Signal-Bruecke angelegter Raum hat aber weder Alias noch
// Gruppendokument; er ist per Definition nicht ableitbar. Die Zuordnung ist hier eine
// ENTSCHEIDUNG, keine Ableitung, und deshalb ein Aufruf mit ausdruecklichem Ziel.
//
// Drei Zustaende, und alle drei sind erreichbar (siehe `getRoomTenantMarker` in shared.ts):
//
//   tenants: ['scs']   → nur in der scs-App sichtbar
//   tenants: []        → in keiner App sichtbar (privat; in Element weiterhin normal lesbar)
//   kein Marker        → unklassifiziert; fuer Bruecken-Raeume heisst das seit Regel 4b
//                        ebenfalls «nirgends», fuer alles andere «ueberall»
//
// Der Raum selbst wird nie angefasst: kein Rename, kein Kick, kein Purge. Die Zuordnung ist
// ein Zustandsereignis und jederzeit umkehrbar — genau deshalb ist sie das richtige Werkzeug
// fuer persoenliche Bruecken-Chats, wo Loeschen die falsche Antwort waere.

import { onCall, HttpsError } from 'firebase-functions/v2/https';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireRole,
  requireParam,
  getUserTenants,
  getRoomTenantMarker,
  setRoomTenants,
} from './shared';

interface RoomAssignment {
  roomId: string;
  name: string;
  creator: string;
  joinedMembers: number;
  /** undefined = kein Marker, [] = keiner App zugeordnet */
  tenants: string[] | undefined;
  /** true, wenn der Raum von einer Chat-Bruecke angelegt wurde (`@signalbot` & Co.) */
  bridged: boolean;
}

/**
 * Localparts der mautrix-Bruecken-Bots. Spiegelt `BRIDGE_BOT_LOCALPARTS` in `@okr/chat-util`
 * (libs sind im Functions-Build nicht importierbar — beide zusammen pflegen).
 */
const BRIDGE_BOT_LOCALPARTS = [
  'signalbot', 'whatsappbot', 'telegrambot', 'discordbot', 'slackbot',
  'instagrambot', 'messengerbot', 'gmessagesbot', 'twitterbot',
];

function isBridgeBotId(userId: string | undefined): boolean {
  if (!userId) return false;
  return BRIDGE_BOT_LOCALPARTS.includes(userId.split(':')[0].replace(/^@/, '').toLowerCase());
}

interface SynapseRoom {
  room_id: string;
  name?: string | null;
  canonical_alias?: string | null;
  creator?: string | null;
  joined_members?: number;
}

/**
 * Raeume auflisten, die keiner Gruppe zugeordnet sind — die Vorlage fuer die Zuordnung.
 *
 * Listet ausdruecklich NICHT alle Raeume: was einen `#group_`-Alias traegt, gehoert einer
 * Gruppe und wird vom Backfill versorgt; es hier anzubieten wuerde dazu verleiten, eine
 * abgeleitete Zuordnung von Hand zu ueberschreiben. Uebrig bleibt, was eine Entscheidung
 * braucht: Bruecken-Raeume und alias-lose Altlasten.
 */
export const listUnassignedMatrixRooms = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ rooms: RoomAssignment[] }> => {
    await requireRole(request, 'listUnassignedMatrixRooms', ['admin']);
    const adminToken = matrixAdminToken.value();

    const rooms: SynapseRoom[] = [];
    let from = 0;
    for (;;) {
      const resp = await fetch(
        `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms?limit=200&from=${from}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (!resp.ok) throw new HttpsError('internal', `Synapse room list failed: ${await resp.text()}`);
      const page = await resp.json() as { rooms: SynapseRoom[]; next_batch?: number };
      rooms.push(...page.rooms);
      if (page.next_batch === undefined) break;
      from = page.next_batch;
    }

    const candidates = rooms.filter(r => {
      const alias = r.canonical_alias?.split(':')[0].replace(/^#/, '').toLowerCase();
      return !alias?.startsWith('group_') && !alias?.startsWith('ask_');
    });

    const result: RoomAssignment[] = [];
    for (const r of candidates) {
      result.push({
        roomId: r.room_id,
        name: r.name || '',
        creator: r.creator || '',
        joinedMembers: r.joined_members ?? 0,
        tenants: await getRoomTenantMarker(r.room_id, adminToken).catch(() => undefined),
        bridged: isBridgeBotId(r.creator ?? undefined),
      });
    }

    console.log(`listUnassignedMatrixRooms: ${result.length} of ${rooms.length} rooms need a decision`);
    return { rooms: result };
  },
);

/**
 * Einen Raum einem Mandanten zuordnen, oder ausdruecklich keinem (`tenants: []`).
 *
 * Die Mandantenpruefung ist hier eine ANDERE als bei den uebrigen Raum-Callables: statt
 * `requireRoomInTenant` (darf der Aufrufer diesen Raum anfassen) gilt, dass er nur Mandanten
 * setzen darf, denen er selbst angehoert. Sonst koennte ein Admin von elab einen Raum in die
 * scs-App schieben — dieselbe homeserver-globale Luecke, nur in die andere Richtung.
 *
 * Auf einen Raum MIT `#group_`-Alias wird nicht geschrieben: dessen Zuordnung gehoert dem
 * Gruppendokument (`onGroupChatCleanup` zieht sie nach), und eine Handzuordnung waere beim
 * naechsten Schreiben auf die Gruppe wieder weg — ein stiller Rueckfall, der genau dann
 * auffaellt, wenn man sich auf ihn verlaesst.
 */
export const assignMatrixRoomTenants = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ roomId: string; tenants: string[] }> => {
    const uid = await requireRole(request, 'assignMatrixRoomTenants', ['admin']);

    const { roomId, tenants } = request.data as { roomId: string; tenants: unknown };
    requireParam(roomId, 'roomId');
    if (!Array.isArray(tenants) || tenants.some(t => typeof t !== 'string' || !t.trim())) {
      throw new HttpsError('invalid-argument', 'tenants must be an array of non-empty strings (empty array = no app)');
    }
    const wanted = [...new Set((tenants as string[]).map(t => t.trim()))];

    const callerTenants = await getUserTenants(uid);
    const foreign = wanted.filter(t => !callerTenants.includes(t));
    if (foreign.length) {
      throw new HttpsError('permission-denied', `not a member of tenant(s): ${foreign.join(', ')}`);
    }

    const adminToken = matrixAdminToken.value();

    const resp = await fetch(
      `${MATRIX_HOMESERVER}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    if (!resp.ok) throw new HttpsError('not-found', `room ${roomId} not found on the homeserver`);
    const room = await resp.json() as SynapseRoom;

    const alias = room.canonical_alias?.split(':')[0].replace(/^#/, '').toLowerCase();
    if (alias?.startsWith('group_') || alias?.startsWith('ask_')) {
      throw new HttpsError(
        'failed-precondition',
        `room ${roomId} belongs to a group (${room.canonical_alias}) — change the group's tenants instead`,
      );
    }

    // Einen Raum, in dem der Aufrufer nichts verloren hat, darf er auch nicht einsammeln:
    // ein bereits zugeordneter Raum bleibt den Mandanten vorbehalten, die ihn tragen.
    const current = await getRoomTenantMarker(roomId, adminToken);
    if (current?.length && !current.some(t => callerTenants.includes(t))) {
      throw new HttpsError('permission-denied', `room ${roomId} belongs to another tenant`);
    }

    if (!await setRoomTenants(roomId, wanted, adminToken)) {
      throw new HttpsError('internal', `failed to write the tenant marker of ${roomId}`);
    }

    console.log(
      `assignMatrixRoomTenants: ${roomId} (${room.name || 'unnamed'}) ` +
      `[${current ?? 'unmarked'}] → [${wanted}] by ${uid}`,
    );
    return { roomId, tenants: wanted };
  },
);
