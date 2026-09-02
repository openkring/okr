// apps/functions/src/matrix-simple/adhoc-chat.ts
//
// Ad-hoc-Chats: ein Chat mit mehreren Personen, ohne eigene Vereinsgruppe.
// Siehe planning/specs/2026-09-01-adhoc-chats-spec.md.
//
// Ein Ad-hoc-Chat IST ein Gruppendokument (`kind: 'chat'`, alle has*-Unterfunktionen
// ausser `hasChat` aus) — deshalb laufen resolveGroupRoom, der Tenant-Marker, der
// Alias, onMembershipWritten (Zwangsbeitritt und Kick), das Backfill und die
// Drift-Werkzeuge unveraendert weiter.
//
// Warum die Anlage hier und nicht im Client (Spec §3/§4):
//  - der Schluessel muss zufaellig sein (§2) und alle Felder korrekt gesetzt, sonst
//    entsteht eine halbe Gruppe mit Kalender und Dateiordner;
//  - hier wird geprueft, WEN man einladen darf (nur Personen des eigenen Mandanten);
//  - der Client schreibt damit gar nicht nach `groups`, und die offene Schreibregel
//    (TOC 2.105) kann verschaerft werden, ohne diesen Weg zu brechen.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import {
  matrixAdminToken,
  MATRIX_HOMESERVER,
  requireUserPersonKey,
  requireProvisionedUser,
  ensureMatrixUserExists,
  resolveGroupRoom,
  setRoomName,
  ensureAdminInRoom,
  forceJoinUserToRoom,
  requireParam,
  checkRateLimit,
  activeGroupMemberKeys,
  serverHostname,
  getUserTenants,
} from './shared';

/** Hoechstzahl Mitglieder eines Ad-hoc-Chats (die anlegende Person eingerechnet). */
export const ADHOC_CHAT_MAX_MEMBERS = 20;

/** Laenge des Zufallsteils im Schluessel `<tenant>_c_<random>`. */
const ADHOC_KEY_RANDOM_LENGTH = 10;

/** Alphabet des Zufallsteils: Kleinbuchstaben und Ziffern, also aliastauglich. */
const ADHOC_KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Ein Schluessel fuer einen Ad-hoc-Chat: `<tenant>_c_<zufall>`.
 *
 * NICHT aus dem Namen abgeleitet — das ist der Kern von Spec §2. `getGroupKeyFromName`
 * bildet `<tenant>_<name>`, und `FirestoreService.createModel` schreibt mit `setDoc`:
 * ein Chat namens «Vorstand» wuerde das Gruppendokument `scs_vorstand` ueberschreiben
 * und dessen Matrix-Raum uebernehmen.
 */
export function adhocChatKey(tenantId: string, randomPart: string): string {
  return `${tenantId}_c_${randomPart}`;
}

function randomKeyPart(): string {
  const bytes = new Uint8Array(ADHOC_KEY_RANDOM_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ADHOC_KEY_ALPHABET[b % ADHOC_KEY_ALPHABET.length]).join('');
}

/**
 * Der Anzeigename eines Ad-hoc-Chats ohne eigene Eingabe: die Vornamen der Mitglieder
 * ausser der eigenen Person, aufgezaehlt. Ab vier Namen wird abgekuerzt.
 */
export function deriveAdhocChatName(firstNames: string[]): string {
  const names = firstNames.filter((n) => !!n && n.trim().length > 0);
  if (names.length === 0) return 'Chat';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

type PersonRow = { okey: string; firstName: string; lastName: string };

/**
 * Lege einen Ad-hoc-Chat an: Gruppendokument (`kind: 'chat'`), Matrix-Raum und eine
 * Mitgliedschaft je Person. Gibt Schluessel und Raum zurueck, damit der Client den Chat
 * sofort oeffnen kann.
 *
 * Reihenfolge ist wichtig: erst das Dokument, dann der Raum, erst danach die
 * Mitgliedschaften. `onMembershipWritten` loest den Raum sonst parallel selbst auf und
 * beide Pfade wuerden gleichzeitig einen Raum mit demselben Alias anlegen wollen
 * (`M_ROOM_IN_USE` ist auf dem Erzeugungspfad nicht behandelt). Mit persistierter
 * `matrixRoomId` nimmt der Trigger die schnelle Spur und tritt nur noch bei.
 */
export const createAdhocChat = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ groupKey: string; roomId: string; name: string }> => {
    const uid = await requireProvisionedUser(request, 'createAdhocChat');
    checkRateLimit(uid, 'createAdhocChat', 5);

    const { name, personKeys, tenantId } = request.data as {
      name?: string;
      personKeys?: string[];
      tenantId?: string;
    };
    const tenant = requireParam(tenantId, 'tenantId', 50);
    if (!Array.isArray(personKeys) || personKeys.length === 0) {
      throw new HttpsError('invalid-argument', 'personKeys is required');
    }
    if (typeof name === 'string' && name.length > 50) {
      throw new HttpsError('invalid-argument', 'name exceeds maximum length of 50');
    }

    // Der Mandant muss einer der eigenen sein — sonst legte jemand einen Chat in einem
    // fremden Verein an, den dessen Mitglieder in ihrer Liste saehen.
    const callerTenants = await getUserTenants(uid);
    if (!callerTenants.includes(tenant)) {
      throw new HttpsError('permission-denied', 'Not a member of this tenant.');
    }

    const creatorKey = await requireUserPersonKey(uid, 'createAdhocChat');
    const memberKeys = [...new Set([creatorKey, ...personKeys])];
    if (memberKeys.length < 2) {
      throw new HttpsError('invalid-argument', 'A chat needs at least one other person.');
    }
    if (memberKeys.length > ADHOC_CHAT_MAX_MEMBERS) {
      throw new HttpsError('invalid-argument', `A chat may have at most ${ADHOC_CHAT_MAX_MEMBERS} members.`);
    }

    const db = getFirestore();

    // Jede eingeladene Person muss im selben Mandanten gefuehrt sein. Das ist die einzige
    // serverseitige Schranke dagegen, jemanden aus einem fremden Verein in einen Chat zu
    // ziehen — der Client filtert die Auswahlliste, aber der Client entscheidet nichts.
    const persons: PersonRow[] = [];
    for (const key of memberKeys) {
      const snap = await db.collection('persons').doc(key).get();
      const data = snap.data();
      if (!snap.exists || !data) {
        throw new HttpsError('not-found', `Person ${key} not found`);
      }
      if (!((data['tenants'] ?? []) as string[]).includes(tenant)) {
        throw new HttpsError('permission-denied', `Person ${key} does not belong to this tenant.`);
      }
      persons.push({
        okey: key,
        firstName: (data['firstName'] as string) ?? '',
        lastName: (data['lastName'] as string) ?? '',
      });
    }

    const chatName = (name ?? '').trim() ||
      deriveAdhocChatName(persons.filter((p) => p.okey !== creatorKey).map((p) => p.firstName));

    // Freien Zufallsschluessel suchen. Bei 36^10 Moeglichkeiten ist eine Kollision
    // theoretisch; die Schleife kostet nichts und schliesst sie aus.
    let groupKey = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = adhocChatKey(tenant, randomKeyPart());
      if (!(await db.collection('groups').doc(candidate).get()).exists) {
        groupKey = candidate;
        break;
      }
    }
    if (!groupKey) throw new HttpsError('internal', 'Could not allocate a chat key.');

    const creator = persons.find((p) => p.okey === creatorKey);

    // Schritt 1: das Gruppendokument. `kind: 'chat'` haelt es aus jeder Gruppenoberflaeche
    // heraus, `chatMode: 'members'` weist Nicht-Mitglieder am Raum ab.
    await db.collection('groups').doc(groupKey).set({
      name: chatName,
      kind: 'chat',
      notes: '',
      tags: '',
      icon: 'group',
      hasContent: false,
      hasChat: true,
      hasCalendar: false,
      hasTasks: false,
      hasFiles: false,
      filesFolder: '',
      hasMembers: false,
      matrixRoomId: '',
      admins: creator
        ? [{
            key: creator.okey,
            name1: creator.firstName,
            name2: creator.lastName,
            modelType: 'person',
            type: '',
            subType: '',
            label: '',
          }]
        : [],
      parentKey: tenant,
      parentName: '',
      parentModelType: 'org',
      visibility: '',
      notifyType: 'memberOnly',
      chatMode: 'members',
      postPolicy: 'all',
      tenants: [tenant],
      isArchived: false,
      index: `n:${chatName} k:${groupKey}`,
    });

    const hostname = serverHostname();
    const adminToken = matrixAdminToken.value();

    // Schritt 2: Raum anlegen (Alias + Tenant-Marker kommen aus resolveGroupRoom) und den
    // Anzeigenamen setzen — der Raum hiesse sonst nach dem Zufallsschluessel (Spec §2).
    const roomId = await resolveGroupRoom(groupKey, hostname, adminToken, { create: true });
    if (!roomId) throw new HttpsError('internal', `No room for chat ${groupKey}`);
    await ensureAdminInRoom(roomId, adminToken);
    await setRoomName(roomId, chatName, adminToken);
    // Wer spaeter dazukommt, liest ab dem Beitritt mit — nicht, was vorher geschrieben
    // wurde. Die Matrix-Vorgabe des `private_chat`-Presets waere `shared`, also der ganze
    // Verlauf; in einem privaten Chat, den Mitglieder selbst zusammenstellen, ist das die
    // falsche Vorgabe (Spec §10.2). Gruppenraeume bleiben unberuehrt: das steht hier und
    // nicht in resolveGroupRoom.
    await setHistoryVisibility(roomId, 'joined', adminToken);

    // Schritt 3: Mitgliedschaften — sie tragen den Zwangsbeitritt (und spaeter das
    // Verlassen). Der Beitritt geschieht hier zusaetzlich direkt, damit der Chat sofort
    // benutzbar ist und nicht auf den Trigger wartet; beides ist idempotent.
    const batch = db.batch();
    for (const person of persons) {
      batch.set(db.collection('memberships').doc(), adhocMembershipDoc(person, groupKey, chatName, tenant));
    }
    await batch.commit();

    for (const person of persons) {
      const matrixUserId = `@${person.okey.toLowerCase()}:${hostname}`;
      await ensureMatrixUserExists(matrixUserId, adminToken, { personKey: person.okey });
      await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
    }

    console.log(`createAdhocChat: ${groupKey} ("${chatName}") with ${persons.length} members in room ${roomId}`);
    return { groupKey, roomId, name: chatName };
  }
);

/**
 * Ein Mitgliedschaftsdokument fuer einen Ad-hoc-Chat. Dieselbe Form wie eine
 * Gruppenmitgliedschaft — das ist der Punkt: `onMembershipWritten` traegt daraufhin den
 * Zwangsbeitritt (und beim Ende den Rauswurf), ohne irgendetwas ueber Chats zu wissen.
 */
function adhocMembershipDoc(person: PersonRow, groupKey: string, chatName: string, tenant: string): Record<string, unknown> {
  return {
    tenants: [tenant],
    isArchived: false,
    index: `mn:${person.firstName} ${person.lastName} mk:${person.okey} ok:${groupKey} on:${chatName}`,
    tags: '',
    notes: '',
    memberKey: person.okey,
    memberName1: person.firstName,
    memberName2: person.lastName,
    memberModelType: 'person',
    memberType: 'male',
    memberNickName: '',
    memberAbbreviation: '',
    memberBirthYear: '',
    memberIsDeceased: false,
    memberDeathYear: '',
    memberZipCode: '',
    memberBexioId: '',
    memberId: '',
    orgKey: groupKey,
    orgName: chatName,
    orgModelType: 'group',
    dateOfEntry: getTodayStr(DateFormat.StoreDate),
    dateOfExit: '99991231',
    category: 'active',
    state: 'active',
    orgFunction: '',
    order: 1,
    relLog: '',
    relIsLast: true,
    rebate: 0,
    rebateReason: 'none',
  };
}

/**
 * Setzt, wie viel des Verlaufs neue Mitglieder sehen (`m.room.history_visibility`).
 * `joined` = erst ab dem eigenen Beitritt.
 */
async function setHistoryVisibility(roomId: string, visibility: 'joined' | 'invited' | 'shared', adminToken: string): Promise<void> {
  const resp = await fetch(
    `${MATRIX_HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.history_visibility`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ history_visibility: visibility }),
    }
  );
  if (!resp.ok) {
    console.warn(`setHistoryVisibility: failed for ${roomId}: ${await resp.text()}`);
  }
}

/**
 * Personen zu einem bestehenden Ad-hoc-Chat hinzufuegen (Spec §10.2).
 *
 * Hinzufuegen darf, wer selbst im Chat ist — es gibt keine Chat-Admins, und eine
 * Sonderrolle fuer die anlegende Person waere in einem Chat unter Gleichen willkuerlich.
 * Die Grenze ist der Mandant: eingeladen werden koennen nur Personen desselben Vereins.
 *
 * Neue Mitglieder lesen ab dem Beitritt mit, nicht rueckwaerts — der Raum traegt seit
 * seiner Anlage `history_visibility: 'joined'`.
 */
export const addAdhocChatMembers = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ added: string[] }> => {
    const uid = await requireProvisionedUser(request, 'addAdhocChatMembers');
    checkRateLimit(uid, 'addAdhocChatMembers', 20);

    const { groupKey, personKeys } = request.data as { groupKey?: string; personKeys?: string[] };
    const chatKey = requireParam(groupKey, 'groupKey', 100);
    if (!Array.isArray(personKeys) || personKeys.length === 0) {
      throw new HttpsError('invalid-argument', 'personKeys is required');
    }

    const callerKey = await requireUserPersonKey(uid, 'addAdhocChatMembers');
    const db = getFirestore();

    const groupSnap = await db.collection('groups').doc(chatKey).get();
    const group = groupSnap.data();
    if (!groupSnap.exists || !group) throw new HttpsError('not-found', `Chat ${chatKey} not found`);
    if ((group['kind'] ?? 'group') !== 'chat') {
      throw new HttpsError('failed-precondition', `${chatKey} is not an ad-hoc chat.`);
    }
    const tenant = ((group['tenants'] ?? []) as string[])[0];
    if (!tenant) throw new HttpsError('failed-precondition', `Chat ${chatKey} has no tenant.`);
    const chatName = (group['name'] as string) ?? '';

    // Wer nicht drin ist, fuegt auch niemanden hinzu — sonst koennte jede Person mit dem
    // Schluessel eines fremden Chats sich selbst hineinschreiben.
    const currentKeys = await activeGroupMemberKeys(chatKey);
    if (!currentKeys.includes(callerKey)) {
      throw new HttpsError('permission-denied', 'Only members of the chat may add people.');
    }

    const wanted = [...new Set(personKeys)].filter((k) => !currentKeys.includes(k));
    if (wanted.length === 0) return { added: [] };
    if (currentKeys.length + wanted.length > ADHOC_CHAT_MAX_MEMBERS) {
      throw new HttpsError('invalid-argument', `A chat may have at most ${ADHOC_CHAT_MAX_MEMBERS} members.`);
    }

    const persons: PersonRow[] = [];
    for (const key of wanted) {
      const snap = await db.collection('persons').doc(key).get();
      const data = snap.data();
      if (!snap.exists || !data) throw new HttpsError('not-found', `Person ${key} not found`);
      if (!((data['tenants'] ?? []) as string[]).includes(tenant)) {
        throw new HttpsError('permission-denied', `Person ${key} does not belong to this tenant.`);
      }
      persons.push({
        okey: key,
        firstName: (data['firstName'] as string) ?? '',
        lastName: (data['lastName'] as string) ?? '',
      });
    }

    const batch = db.batch();
    for (const person of persons) {
      batch.set(db.collection('memberships').doc(), adhocMembershipDoc(person, chatKey, chatName, tenant));
    }
    await batch.commit();

    // Der Trigger wuerde das auch tun; direkt beitreten heisst, dass die neue Person den
    // Chat sofort sieht statt in zehn Sekunden. Beides ist idempotent.
    const hostname = serverHostname();
    const adminToken = matrixAdminToken.value();
    const roomId = (group['matrixRoomId'] as string) ||
      await resolveGroupRoom(chatKey, hostname, adminToken, { create: false });
    if (roomId) {
      await ensureAdminInRoom(roomId, adminToken);
      for (const person of persons) {
        const matrixUserId = `@${person.okey.toLowerCase()}:${hostname}`;
        await ensureMatrixUserExists(matrixUserId, adminToken, { personKey: person.okey });
        await forceJoinUserToRoom(roomId, matrixUserId, adminToken);
      }
    }

    console.log(`addAdhocChatMembers: ${persons.length} added to ${chatKey} by ${callerKey}`);
    return { added: persons.map((p) => p.okey) };
  }
);

/**
 * Einen Ad-hoc-Chat verlassen: die eigene Mitgliedschaft beenden.
 *
 * Der Kick aus dem Matrix-Raum passiert nicht hier, sondern in `onMembershipWritten` —
 * derselbe Weg wie beim Ende einer Gruppenmitgliedschaft. Der Chat laeuft fuer die
 * anderen weiter; verlaesst die letzte Person ihn, bleibt ein Dokument ohne aktive
 * Mitgliedschaft zurueck (Spec §5, offener Punkt).
 */
export const leaveAdhocChat = onCall(
  {
    cors: true,
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [matrixAdminToken],
  },
  async (request): Promise<{ left: boolean }> => {
    const uid = await requireProvisionedUser(request, 'leaveAdhocChat');
    checkRateLimit(uid, 'leaveAdhocChat', 20);

    const { groupKey } = request.data as { groupKey?: string };
    const chatKey = requireParam(groupKey, 'groupKey', 100);

    const personKey = await requireUserPersonKey(uid, 'leaveAdhocChat');
    const db = getFirestore();

    const groupSnap = await db.collection('groups').doc(chatKey).get();
    const group = groupSnap.data();
    if (!groupSnap.exists || !group) throw new HttpsError('not-found', `Chat ${chatKey} not found`);
    // Nur Ad-hoc-Chats: aus einer gefuehrten Vereinsgruppe tritt man nicht selbst aus —
    // die Mitgliedschaft dort ist eine Vereinstatsache, keine Chat-Teilnahme.
    if ((group['kind'] ?? 'group') !== 'chat') {
      throw new HttpsError('failed-precondition', `${chatKey} is not an ad-hoc chat.`);
    }

    const snap = await db.collection('memberships')
      .where('orgKey', '==', chatKey)
      .where('orgModelType', '==', 'group')
      .where('memberKey', '==', personKey)
      .get();
    if (snap.empty) return { left: false };

    const today = getTodayStr(DateFormat.StoreDate);
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, { dateOfExit: today, isArchived: true });
    }
    await batch.commit();

    console.log(`leaveAdhocChat: ${personKey} left ${chatKey}`);
    return { left: true };
  }
);
