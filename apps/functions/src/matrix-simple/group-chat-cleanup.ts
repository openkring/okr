// apps/functions/src/matrix-simple/group-chat-cleanup.ts
//
// Der Rueckweg fuers Loeschen: verschwindet eine Gruppe, folgt ihr Chatraum.
//
// Warum es das braucht: `resolveGroupRoom` legt Raeume an, nichts raeumt sie ab. Ein Raum
// ueberlebt daher sein Gruppendokument — mit Tenant-Marker, 189 Mitgliedern und voller
// Schreibberechtigung, aber ohne Gruppe, ohne Besitzer und ohne jede Verwaltungsoberflaeche
// (alle Gruppen-Chat-Aktionen gehen ueber das Gruppendokument). Genau so ist der Raum
// «Breitensport» nach dem Loeschen seiner Gruppe monatelang sichtbar geblieben, bis zwei
// Mitglieder ihn wieder als lebenden Kanal benutzt haben. Der Kommentar in
// `onGroupNameWritten` («geloescht — der Raum wird an anderer Stelle behandelt») beschrieb
// eine Stelle, die es nicht gab; das ist sie.
//
// Die drei Faelle sind NICHT derselbe Fall, und der Unterschied ist der gleiche wie in der
// Firestore-Welt (siehe Skill `deleting-models`): Loeschen heisst in dieser App archivieren,
// und bei einem ueber mehrere Mandanten geteilten Dokument heisst es abloesen, nicht
// archivieren. Uebertragen auf Matrix:
//
//   | Gruppendokument                        | Raum                                       |
//   | -------------------------------------- | ------------------------------------------ |
//   | Mandant entfernt, mind. einer bleibt   | Marker auf die restlichen Mandanten setzen |
//   | archiviert (`isArchived: true`)        | Marker leeren → nirgends sichtbar          |
//   | Dokument wirklich weg (Konsole)        | loeschen + purgen                          |
//
// Warum Archivieren den Raum NICHT purgt: Archivieren ist umkehrbar (`showArchived`,
// Wiederherstellen), `DELETE …?purge=true` ist es nicht. Einen Verlauf fuer eine umkehrbare
// Handlung unwiederbringlich zu zerstoeren waere der teuerste moegliche Fehler dieser Datei.
// Der geleerte Marker nimmt den Raum aus jeder App (`filterRoomsOfTenant` Regel 1b), laesst
// Raum und Verlauf aber stehen — und `onGroupUnarchived` stempelt ihn beim Wiederherstellen
// zurueck. Nur das echte Loeschen des Dokuments purgt, denn dann gibt es nichts mehr,
// wofuer der Verlauf aufgehoben wuerde.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import {
  matrixAdminToken,
  setRoomTenants,
  getRoomTenantMarker,
  MATRIX_HOMESERVER,
} from './shared';

const GROUP_COLLECTION = 'groups';

interface GroupChatDoc {
  name?: string;
  tenants?: string[];
  isArchived?: boolean;
  matrixRoomId?: string;
}

/**
 * Raum loeschen und purgen (asynchron auf Synapse; liefert die delete_id).
 *
 * Bewusst hier und nicht ueber die `deleteMatrixRoom`-Callable: jene traegt `requireRole` und
 * `requireRoomInTenant`, also einen Aufrufer-Kontext, den ein Trigger nicht hat. Die
 * Mandantenpruefung ist hier auch nicht noetig — die Autorisierung ist bereits geschehen,
 * indem jemand das Gruppendokument loeschen durfte.
 */
async function deleteAndPurgeRoom(roomId: string, adminToken: string, reason: string): Promise<string | undefined> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: false, purge: true, message: reason }),
    },
  );
  if (!resp.ok) {
    console.warn(`deleteAndPurgeRoom: ${roomId} → ${resp.status}: ${await resp.text()}`);
    return undefined;
  }
  const data = await resp.json() as { delete_id?: string };
  return data.delete_id;
}

/**
 * Gruppendokument geschrieben → Chatraum nachziehen, wenn die Gruppe abgeloest, archiviert,
 * wiederhergestellt oder geloescht wurde.
 *
 * Eigener Trigger neben `onGroupNameWritten` und `onGroupPostPolicyWritten`, aus demselben
 * Grund wie dort: drei fachlich unabhaengige Rueckwege in einer Funktion heissen, dass ein
 * Fehler im einen die anderen mitreisst — und dieser hier ist der einzige, der etwas
 * unwiederbringlich zerstoeren kann.
 *
 * Fehler werden geloggt, nie geworfen: ein Synapse-Schluckauf darf das Loeschen der Gruppe
 * nicht scheitern lassen. Der Preis ist ein Raum, der einen Lauf zu lange lebt — genau der
 * Zustand, den das Audit findet.
 */
export const onGroupChatCleanup = onDocumentWritten(
  {
    document: `${GROUP_COLLECTION}/{groupId}`,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as GroupChatDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as GroupChatDoc) : undefined;
    const groupId = event.params.groupId;

    // Der Raum steht im BEFORE, wenn das Dokument weg ist — danach gibt es keine Quelle mehr.
    const roomId = (after?.matrixRoomId || before?.matrixRoomId || '').trim();
    if (!roomId) return; // Gruppe ohne Chatraum: nichts nachzuziehen

    try {
      const adminToken = matrixAdminToken.value();

      // 1. Dokument wirklich geloescht (Konsole, Admin-Skript) → Raum purgen.
      if (!after) {
        const deleteId = await deleteAndPurgeRoom(
          roomId, adminToken, `Group ${groupId} was deleted`,
        );
        console.log(`onGroupChatCleanup: ${groupId} deleted → room ${roomId} purge ${deleteId ?? 'FAILED'}`);
        return;
      }

      const wasArchived = before?.isArchived === true;
      const isArchived = after.isArchived === true;
      const tenants = after.tenants ?? [];

      // 2. Archiviert → Marker leeren. Raum und Verlauf bleiben, sichtbar ist er nirgends.
      if (isArchived && !wasArchived) {
        const ok = await setRoomTenants(roomId, [], adminToken);
        console.log(`onGroupChatCleanup: ${groupId} archived → room ${roomId} unassigned ${ok ? 'ok' : 'failed'}`);
        return;
      }

      // 3. Wiederhergestellt → Marker zurueckstempeln, sonst bleibt der Raum unsichtbar.
      if (!isArchived && wasArchived) {
        if (!tenants.length) return; // kann nicht vorkommen: ein Dokument ohne Mandanten ist unlesbar
        const ok = await setRoomTenants(roomId, tenants, adminToken);
        console.log(`onGroupChatCleanup: ${groupId} restored → room ${roomId} → [${tenants}] ${ok ? 'ok' : 'failed'}`);
        return;
      }

      // 4. Mandantenliste geaendert (Abloesen oder Hinzufuegen) → Marker nachziehen.
      //    Nur bei echter Aenderung, denn dieser Trigger laeuft bei JEDEM Schreiben auf die
      //    Gruppe: ohne den Vergleich wuerde jede Namensaenderung einen Marker-Schreibvorgang
      //    (und ein `ensureAdminInRoom`) nach sich ziehen.
      const beforeTenants = before?.tenants ?? [];
      if (isArchived || sameTenants(beforeTenants, tenants) || !tenants.length) return;

      // Einen bewusst geleerten Marker nicht wiederbeleben: der Raum wurde von Hand aus allen
      // Apps genommen, und eine unabhaengige Mandantenaenderung am Dokument ist kein Auftrag,
      // diese Entscheidung zu widerrufen.
      if ((await getRoomTenantMarker(roomId, adminToken))?.length === 0) {
        console.log(`onGroupChatCleanup: ${groupId} tenants changed but room ${roomId} is unassigned — left alone`);
        return;
      }

      const ok = await setRoomTenants(roomId, tenants, adminToken);
      console.log(
        `onGroupChatCleanup: ${groupId} tenants [${beforeTenants}] → [${tenants}] ` +
        `→ room ${roomId} ${ok ? 'ok' : 'failed'}`,
      );
    } catch (error) {
      console.error(`onGroupChatCleanup: failed for group ${groupId}:`, error);
    }
  },
);

/** Mandantenlisten inhaltlich vergleichen — Reihenfolge ist bedeutungslos. */
export function sameTenants(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((t, i) => t === sortedB[i]);
}
