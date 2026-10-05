// apps/functions/src/matrix-simple/chat-mode-sync.ts
//
// Eine geschlossene Gruppe (`chatMode: 'members'`) heisst: der Raum spiegelt die Mitgliederliste.
// `requestGroupRoomAccess` setzt das aber nur an der TUER durch — wer schon im Raum sitzt, bleibt.
// Und es gibt zwei Wege hinein, die die Tuer nie sieht:
//
//   - die Gruppe war 'shared' (Standard), jemand hat den Chat geoeffnet und wurde zwangsweise
//     beigetreten; danach wurde sie auf 'members' umgestellt;
//   - ein Gruppen-Admin wird zugelassen (Ausnahme in `requestGroupRoomAccess`) und spaeter aus
//     `admins[]` entfernt.
//
// In beiden Faellen sagt die Gruppenansicht korrekt «nur fuer Mitglieder», Synapse schickt aber
// weiter Pushes, und das Dashboard (Nachrichten-Sektion) zeigt ungelesene Nachrichten eines
// Raums, den die Person ueber die Gruppe gar nicht oeffnen darf. So gefunden 2026-10-05 in
// «4x Mittwoch», «Ruderkurs August» und «Gipfelischiff».
//
// Dieser Trigger raeumt den Raum genau dann auf, wenn sich an der Zulassung etwas aendert:
// beim Wechsel auf 'members' und bei einer Aenderung von `admins[]` einer 'members'-Gruppe.
// Fuer 'shared'/'ask' tut er nichts — dort sind Nicht-Mitglieder gewollt (Kursteilnehmende).

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import {
  matrixAdminToken,
  serverHostname,
  ensureAdminInRoom,
  kickUserFromRoom,
  activeGroupMemberKeys,
} from './shared';
import { readRoomMemberState, SERVICE_ACCOUNT_LOCALPARTS } from './membership-sync';

const GROUP_COLLECTION = 'groups';

interface GroupChatModeDoc {
  chatMode?: string;
  matrixRoomId?: string;
  admins?: Array<{ key?: string }>;
}

/** Admin-Schluessel kleingeschrieben und sortiert — fuer den Vergleich vorher/nachher. */
export function adminKeysOf(doc: GroupChatModeDoc | undefined): string[] {
  return (doc?.admins ?? [])
    .map((a) => (a.key ?? '').toLowerCase())
    .filter((k) => k.length > 0)
    .sort();
}

/**
 * Muss der Raum einer Gruppe nach diesem Schreibvorgang aufgeraeumt werden?
 *
 * Nur bei einem UPDATE: eine neu angelegte Gruppe (auch ein Ad-hoc-Chat) hat noch keinen Raum
 * oder einen, den `createAdhocChat` gerade selbst befuellt — dort aufzuraeumen hiesse, mit dem
 * Anlegen um die Wette zu laufen.
 */
export function needsClosedRoomCleanup(
  before: GroupChatModeDoc | undefined,
  after: GroupChatModeDoc | undefined,
): boolean {
  if (!before || !after) return false;
  if (after.chatMode !== 'members') return false;
  if (!(after.matrixRoomId ?? '').trim()) return false;
  if (before.chatMode !== 'members') return true;
  const had = adminKeysOf(before);
  const has = adminKeysOf(after);
  return had.length !== has.length || had.some((k, i) => k !== has[i]);
}

/**
 * Wer sitzt im Raum einer geschlossenen Gruppe, ohne dort hinzugehoeren?
 * Zugelassen sind: aktive Mitglieder, Gruppen-Admins (wie in `requestGroupRoomAccess`) und
 * die Dienstkonten. Nur lokale Konten werden gemeldet — fremde Homeserver koennen wir nicht
 * kicken, und es gibt sie in Gruppenraeumen nicht.
 */
export function closedRoomIntruders(
  roomLocalparts: Iterable<string>,
  memberKeys: string[],
  adminKeys: string[],
): string[] {
  const allowed = new Set([...memberKeys, ...adminKeys].map((k) => k.toLowerCase()));
  return [...roomLocalparts]
    .map((lp) => lp.toLowerCase())
    .filter((lp) => !allowed.has(lp) && !SERVICE_ACCOUNT_LOCALPARTS.has(lp));
}

/**
 * Gruppendokument geschrieben → bei einer geschlossenen Gruppe Nicht-Mitglieder aus dem Raum
 * entfernen. Eigener Trigger neben `onGroupChatCleanup`/`onGroupPostPolicyWritten`, aus
 * demselben Grund wie dort: ein Fehler im einen soll die anderen nicht mitreissen.
 *
 * Fehler werden geloggt, nie geworfen. Was liegen bleibt, zeigt `auditGroupRoomMembers` und
 * entfernt `pruneGroupRoomExtras` (AOC).
 */
export const onGroupChatModeWritten = onDocumentWritten(
  {
    document: `${GROUP_COLLECTION}/{groupId}`,
    region: 'europe-west6',
    secrets: [matrixAdminToken],
  },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as GroupChatModeDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as GroupChatModeDoc) : undefined;
    if (!needsClosedRoomCleanup(before, after)) return;

    const groupId = event.params.groupId;
    const roomId = after!.matrixRoomId!.trim();
    try {
      const adminToken = matrixAdminToken.value();
      const hostname = serverHostname();
      const roomMembers = await readRoomMemberState(roomId, adminToken);
      const intruders = closedRoomIntruders(
        roomMembers.keys(),
        await activeGroupMemberKeys(groupId),
        adminKeysOf(after),
      );
      if (intruders.length === 0) return;

      await ensureAdminInRoom(roomId, adminToken);
      let kicked = 0;
      for (const localpart of intruders) {
        try {
          if (await kickUserFromRoom(roomId, `@${localpart}:${hostname}`, adminToken, 'Keine Mitgliedschaft in dieser Gruppe')) {
            kicked++;
          }
        } catch (error) {
          console.error(`onGroupChatModeWritten: failed to kick @${localpart} from ${roomId}:`, error);
        }
      }
      console.log(`onGroupChatModeWritten: ${groupId} closed → removed ${kicked}/${intruders.length} non-member(s) from room ${roomId}`);
    } catch (error) {
      console.error(`onGroupChatModeWritten: failed for group ${groupId}:`, error);
    }
  },
);
