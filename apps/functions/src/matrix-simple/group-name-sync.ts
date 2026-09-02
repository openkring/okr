// apps/functions/src/matrix-simple/group-name-sync.ts
//
// Der Rueckweg fuer den Anzeigenamen: wird eine Gruppe umbenannt, folgt ihr Chatraum.
//
// Warum es das ueberhaupt braucht: der Raumname wird bei der Erzeugung EINMAL gesetzt
// (`resolveGroupRoom`). Ohne diesen Trigger traegt ein Raum bis in alle Ewigkeit den Namen,
// den die Gruppe am Tag ihrer ersten Chat-Oeffnung hatte — und der Widerspruch faellt genau
// dort auf, wo er am meisten stoert: in der Raumuebersicht und im Titel der Nachrichtenliste.
//
// Bewusst ein EIGENER Trigger und keine Erweiterung von `onGroupPostPolicyWritten`: jene
// Funktion traegt die Schreibrechte-Logik, hat einen anderen Rueckweg ('privileged' → 'all')
// und einen taeglichen Sweep als Partner. Zwei fachlich unabhaengige Rueckwege in einer
// Funktion heissen, dass ein Fehler im einen den anderen mitreisst.
//
// Der Raumschluessel bleibt unberuehrt. Umbenannt wird ausschliesslich `m.room.name`; okey,
// Alias und `matrixRoomId` sind die Identitaet des Raums und aendern sich nie mit dem Namen.
// Deshalb ist ein Name mit Blanks und Sonderzeichen hier gefahrlos — solange nichts aus ihm
// eine ID ableitet (siehe `setRoomName` in shared.ts).

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import {
  matrixAdminToken,
  resolveGroupRoom,
  ensureAdminInRoom,
  setRoomName,
  serverHostname,
} from './shared';

const GROUP_COLLECTION = 'groups';

interface GroupNameDoc {
  name?: string;
  hasChat?: boolean;
  matrixRoomId?: string;
}

/**
 * Gruppendokument geschrieben → Raumnamen nachziehen, wenn sich `name` geaendert hat.
 *
 * Kein Raum wird dabei angelegt (`create: false`): eine Gruppe, deren Chat noch nie geoeffnet
 * wurde, hat keinen Raum und braucht durch eine Umbenennung auch keinen. Sie bekommt den
 * aktuellen Namen ohnehin, sobald der Raum entsteht.
 *
 * Ask-Raeume (`#ask_<gruppe>_<person>`) tragen den Gruppennamen ebenfalls im Titel, werden
 * hier aber NICHT mitgezogen — das waere ein Lauf ueber alle Raeume der Gruppe pro
 * Umbenennung. Bekannte Obergrenze; ein Reconcile-Lauf ueber
 * `_synapse/admin/v1/rooms?search_term=ask_<gruppe>_` waere der Weg, falls es je stoert.
 *
 * Fehler werden geloggt, nie geworfen — ein Synapse-Schluckauf darf das Speichern der
 * Gruppe nicht scheitern lassen.
 */
export const onGroupNameWritten = onDocumentWritten(
  {
    document: `${GROUP_COLLECTION}/{groupId}`,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as GroupNameDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as GroupNameDoc) : undefined;
    if (!after) return; // geloescht — der Raum wird an anderer Stelle behandelt

    const oldName = (before?.name ?? '').trim();
    const newName = (after.name ?? '').trim();
    if (!newName || oldName === newName) return;

    const groupId = event.params.groupId;
    try {
      const adminToken = matrixAdminToken.value();
      const roomId = await resolveGroupRoom(groupId, serverHostname(), adminToken, { create: false });
      if (!roomId) return; // noch kein Raum — der bekommt den Namen bei seiner Erzeugung

      await ensureAdminInRoom(roomId, adminToken);
      const ok = await setRoomName(roomId, newName, adminToken);
      console.log(`onGroupNameWritten: ${groupId} "${oldName}" → "${newName}" (${roomId}) ${ok ? 'ok' : 'failed'}`);
    } catch (error) {
      console.error(`onGroupNameWritten: failed for group ${groupId}:`, error);
    }
  },
);
