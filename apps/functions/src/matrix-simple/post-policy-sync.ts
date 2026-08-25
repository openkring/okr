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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  MATRIX_HOMESERVER,
  matrixAdminToken,
  resolveGroupRoom,
  ensureAdminInRoom,
  serverHostname,
  requireRole,
  requireParam,
  getUserTenants,
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
 *
 * `opts.allowReset` ist eine SICHERHEITSGRENZE, keine Optimierung: nur wer Vor- und
 * Nachzustand kennt — also `onGroupPostPolicyWritten` — darf den Rueckweg 'privileged' →
 * 'all' ausloesen (§3.1 des Entwurfs). Sweep und Callable reichen den Parameter NICHT
 * durch, damit dieser Pfad nicht ueber zwei weitere Aufrufer erreichbar bleibt. Ohne
 * `allowReset` bricht die Funktion bei einer 'all'-Gruppe sofort ab, BEVOR
 * `resolveGroupRoom`/`ensureAdminInRoom` laufen — das erspart 'all'-Gruppen (der
 * ueberwiegenden Mehrheit) den teuren und riskanten Raum-Beitritt samt
 * Admin-Eskalation fuer einen Abgleich, der ohnehin nichts schreiben wuerde.
 */
export async function applyRoomPostPolicy(
  groupId: string,
  adminToken: string,
  hostname: string,
  opts: { allowReset?: boolean } = {},
): Promise<'unchanged' | 'applied' | 'no-room'> {
  const db = getFirestore();
  const groupSnap = await db.collection(GROUP_COLLECTION).doc(groupId).get();
  if (!groupSnap.exists) return 'no-room';
  const group = groupSnap.data() as GroupDoc;

  const effectivePolicy = group.postPolicy ?? 'all';
  if (effectivePolicy === 'all' && !opts.allowReset) {
    // Nichts zu tun, und der Rueckweg ist dieser Aufrufer-Kette nicht erlaubt — raus,
    // bevor der Raum ueberhaupt aufgeloest oder der Bot in ihn eskaliert wird.
    return 'unchanged';
  }

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
  if (!currentResp.ok) {
    // JEDER Matrix-Raum hat ein `m.room.power_levels`-Event — ein fehlgeschlagenes GET heisst
    // nie «der Raum hat keins», sondern «wir kennen den Ist-Zustand nicht». Ein `{}`-Fallback
    // wuerde beim anschliessenden PUT (Zustandsevents sind Ersetzung, keine Zusammenfuehrung!)
    // `ban`/`kick`/`redact`/`invite`/`state_default`/`users_default`/`notifications` still auf
    // die Matrix-Spec-Defaults zuruecksetzen. Also lieber nichts tun; der taegliche Sweep
    // (Task 4) versucht es am naechsten Tag erneut.
    console.warn(
      `applyRoomPostPolicy: could not read power levels for ${groupId}/${roomId} → ${currentResp.status}`,
    );
    return 'unchanged';
  }
  const current: CurrentPowerLevels = await currentResp.json();

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
      // Einziger Aufrufer mit `allowReset: true` — er kennt Vor- und Nachzustand und
      // traegt deshalb als Einziger den Rueckweg 'privileged' → 'all' (§3.1).
      const result = await applyRoomPostPolicy(
        event.params.groupId,
        matrixAdminToken.value(),
        serverHostname(),
        { allowReset: true },
      );
      console.log(`onGroupPostPolicyWritten: ${event.params.groupId} ${had} → ${has} (${result})`);
    } catch (error) {
      console.error(`onGroupPostPolicyWritten: failed for group ${event.params.groupId}:`, error);
    }
  },
);

/**
 * Ausloeser 2 von 3: der taegliche Lauf.
 *
 * DAS ist der Weg, auf dem ein Rollenentzug ankommt — Power sinkt in Matrix nicht von
 * selbst, wenn jemand `privileged` in Firestore verliert. Der Preis ist ausgeschrieben:
 * bis zu 24 h. Vertretbar, weil der Kreis klein und namentlich bekannt ist, jede Nachricht
 * mit Absender sichtbar und nachtraeglich loeschbar bleibt und `syncRoomPostPolicy` den
 * sofortigen Handgriff bietet (§3.2 des Entwurfs).
 *
 * Gruppen mit 'all' werden nicht abgefragt und nicht angefasst.
 */
export const sweepRoomPostPolicies = onSchedule(
  {
    schedule: '15 3 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async () => {
    const adminToken = matrixAdminToken.value();
    const hostname = serverHostname();

    const snap = await getFirestore()
      .collection(GROUP_COLLECTION)
      .where('postPolicy', '==', 'privileged')
      .get();

    let applied = 0;
    for (const doc of snap.docs) {
      try {
        if ((await applyRoomPostPolicy(doc.id, adminToken, hostname)) === 'applied') applied++;
      } catch (error) {
        console.error(`sweepRoomPostPolicies: failed for group ${doc.id}:`, error);
      }
    }
    console.log(`sweepRoomPostPolicies: groups=${snap.size} applied=${applied}`);
  },
);

/**
 * Ausloeser 3 von 3: die AOC-Aktion «Schreibrechte abgleichen».
 *
 * Der Handgriff, wenn ein Entzug nicht bis zum naechsten Sweep warten darf, und der
 * Reparaturweg fuer jede Drift — dieselbe Rolle, die reconcileGroupRoomMembers fuer die
 * Mitgliedschaften spielt, und derselbe Rollenkreis.
 */
export const syncRoomPostPolicy = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ result: 'unchanged' | 'applied' | 'no-room' }> => {
    const uid = await requireRole(request, 'syncRoomPostPolicy', ['admin', 'memberAdmin', 'groupAdmin']);

    const groupId = requireParam((request.data as { groupId?: unknown })?.groupId, 'groupId');

    // Tenant-Grenze wie in pruneGroupRoomExtras (membership-sync.ts): sonst kann eine
    // groupAdmin-Rolle in Mandant A einen Abgleich auf eine Gruppe in Mandant B ausloesen.
    const groupSnap = await getFirestore().collection(GROUP_COLLECTION).doc(groupId).get();
    if (!groupSnap.exists) throw new HttpsError('not-found', `Group ${groupId} not found`);
    const groupTenants = (groupSnap.data()?.['tenants'] ?? []) as string[];
    const callerTenants = await getUserTenants(uid);
    if (!groupTenants.some((t) => callerTenants.includes(t))) {
      throw new HttpsError('permission-denied', `Group ${groupId} is not in one of your tenants.`);
    }

    const result = await applyRoomPostPolicy(groupId, matrixAdminToken.value(), serverHostname());
    return { result };
  },
);
