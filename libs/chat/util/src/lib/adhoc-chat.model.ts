import { AvatarInfo } from '@okr/shared-models';

/**
 * Eingabemodell des Ad-hoc-Chat-Formulars (planning/specs/2026-09-01-adhoc-chats-spec.md).
 *
 * Bewusst KEIN Firestore-Modell: das Dokument ist ein `GroupModel` mit `kind: 'chat'`, und
 * angelegt wird es serverseitig von `createAdhocChat`. Der Client sammelt nur diese beiden
 * Angaben ein.
 */
export interface AdhocChatFormModel {
  /**
   * Pflicht, sobald mehr als eine Person gewaehlt ist — dann entsteht ein Ad-hoc-Chat.
   * Bei genau einer Person entsteht eine Direktnachricht und der Wert wird verworfen.
   */
  name: string;
  /** Die eingeladenen Personen OHNE die anlegende Person (die ist immer dabei). */
  members: AvatarInfo[];
}

/** Hoechstzahl Mitglieder; gespiegelt aus ADHOC_CHAT_MAX_MEMBERS in der Cloud Function. */
export const ADHOC_CHAT_MAX_MEMBERS = 20;

/** Ein frisches, leeres Formular — je Aufruf ein neues Objekt, nie eine geteilte Konstante. */
export function newAdhocChatForm(): AdhocChatFormModel {
  return { name: '', members: [] };
}
