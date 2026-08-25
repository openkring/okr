// apps/functions/src/matrix-simple/post-policy-sync.ts
//
// Der eine Schreibpfad von `group.postPolicy` nach Synapse und seine drei Ausloeser
// (planning/specs/2026-08-25-broadcast-rooms-design.md §3).
//
// Bewusst KEIN Trigger auf `users/{uid}`: ein Rollenentzug kommt ueber den taeglichen
// Sweep an (bis zu 24 h verzoegert), die AOC-Callable ist der sofortige Handgriff. Wer das
// aendern will, aendert den Entwurf zuerst — die Begruendung steht dort in §3.2.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

import {
  MATRIX_HOMESERVER,
  matrixAdminToken,
  resolveGroupRoom,
  ensureAdminInRoom,
  serverHostname,
} from './shared';
import {
  buildPowerLevels,
  privilegedPersonKeys,
  type CurrentPowerLevels,
  type PrivilegeUserDoc,
} from './post-policy';

const GROUP_COLLECTION = 'groups';
const POWER_LEVELS_EVENT = 'm.room.power_levels';

interface GroupDoc {
  postPolicy?: 'all' | 'privileged';
  tenants?: string[];
}

/** `anna` → `@anna:matrix.bkchat.etke.host` */
function toMatrixId(personKey: string, hostname: string): string {
  return `@${personKey.toLowerCase()}:${hostname}`;
}

/**
 * Bringt die Power Levels EINES Gruppenraums auf den Stand von `group.postPolicy`.
 *
 * Schreibt nur bei Unterschied. Der Aufrufer entscheidet, ob er die Rueckwaerts-Richtung
 * ('privileged' → 'all') zulaesst: `buildPowerLevels` liefert dafuer nur dann einen Patch,
 * wenn der Raum aktuell tatsaechlich stumm ist.
 */
export async function applyRoomPostPolicy(
  groupId: string,
  adminToken: string,
  hostname: string,
): Promise<'unchanged' | 'applied' | 'no-room'> {
  const db = getFirestore();
  const groupSnap = await db.collection(GROUP_COLLECTION).doc(groupId).get();
  if (!groupSnap.exists) return 'no-room';
  const group = groupSnap.data() as GroupDoc;

  const roomId = await resolveGroupRoom(groupId, hostname, adminToken, { create: false });
  if (!roomId) {
    console.warn(`applyRoomPostPolicy: no room resolvable for group ${groupId}`);
    return 'no-room';
  }
  await ensureAdminInRoom(roomId, adminToken);

  const authHeader = { Authorization: `Bearer ${adminToken}` };
  const stateUrl =
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${POWER_LEVELS_EVENT}/`;

  const currentResp = await fetch(stateUrl, { headers: authHeader });
  const current: CurrentPowerLevels = currentResp.ok ? await currentResp.json() : {};

  // Die Schreibberechtigten des Mandanten der Gruppe. Eine Gruppe traegt genau einen
  // Tenant; faellt der weg, gibt es niemanden zu berechtigen und wir fassen nichts an.
  const tenantId = (group.tenants ?? [])[0];
  if (!tenantId) {
    console.warn(`applyRoomPostPolicy: group ${groupId} has no tenant — skipped`);
    return 'no-room';
  }
  const usersSnap = await db
    .collection('users')
    .where('tenants', 'array-contains', tenantId)
    .get();
  const { adminKeys, privilegedKeys } = privilegedPersonKeys(
    usersSnap.docs.map((d) => d.data() as PrivilegeUserDoc),
    tenantId,
  );

  const patch = buildPowerLevels(
    group.postPolicy,
    current,
    privilegedKeys.map((k) => toMatrixId(k, hostname)),
    adminKeys.map((k) => toMatrixId(k, hostname)),
  );
  if (!patch) return 'unchanged';

  const desired = { ...current, ...patch };
  if (JSON.stringify(desired) === JSON.stringify(current)) return 'unchanged';

  // Der Admin ist diesem Raum unter Umstaenden gerade erst beigetreten und die
  // Mitgliedschaft ist der naechsten Anfrage noch nicht sichtbar — dann 403t der Schreib-
  // vorgang, obwohl der Beitritt geklappt hat. Dieselbe kurze Wiederholung wie in
  // setRoomTenants (shared.ts), die dort acht Raeume in einem Lauf gerettet hat.
  const put = () =>
    fetch(stateUrl, {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(desired),
    });

  let resp = await put();
  if (resp.status === 403) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    resp = await put();
  }
  if (!resp.ok) {
    console.warn(`applyRoomPostPolicy: ${groupId}/${roomId} → ${resp.status}: ${await resp.text()}`);
    return 'unchanged';
  }
  console.log(
    `applyRoomPostPolicy: group=${groupId} room=${roomId} policy=${group.postPolicy ?? 'all'} ` +
    `events_default=${patch.events_default} admins=${adminKeys.length} privileged=${privilegedKeys.length}`,
  );
  return 'applied';
}

/**
 * Ausloeser 1 von 3: das Gruppendokument wurde geaendert.
 *
 * Bewusst ein EIGENER Trigger und keine Erweiterung von `onGroupChange` in replication/:
 * jene Funktion ist die Bexio-Mitglieder-Replikation und traegt kein Matrix-Token. Ihr eines
 * zu geben, zoege ein fachfremdes Geheimnis in eine fremde Funktion — und weil Firebase die
 * Secret-Version in die Revision einfriert, wuerde jede Token-Rotation kuenftig einen
 * Redeploy der Replikation erzwingen (§3.1 des Entwurfs).
 *
 * Dieser Trigger ist zugleich der EINZIGE, der den Rueckweg 'privileged' → 'all' traegt:
 * der Sweep sieht 'all'-Gruppen gar nicht an und wuerde einen zurueckgestellten Raum sonst
 * fuer immer stumm lassen.
 *
 * Fehler werden geloggt, nie geworfen — ein Synapse-Schluckauf darf den Firestore-Schreib-
 * vorgang nicht scheitern lassen.
 */
export const onGroupPostPolicyWritten = onDocumentWritten(
  {
    document: `${GROUP_COLLECTION}/{groupId}`,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as GroupDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as GroupDoc) : undefined;
    if (!after) return; // geloescht — der Raum wird an anderer Stelle behandelt

    const had = before?.postPolicy ?? 'all';
    const has = after.postPolicy ?? 'all';
    if (had === has) return; // kein schreibrechts-relevanter Unterschied

    try {
      const result = await applyRoomPostPolicy(
        event.params.groupId,
        matrixAdminToken.value(),
        serverHostname(),
      );
      console.log(`onGroupPostPolicyWritten: ${event.params.groupId} ${had} → ${has} (${result})`);
    } catch (error) {
      console.error(`onGroupPostPolicyWritten: failed for group ${event.params.groupId}:`, error);
    }
  },
);
