import { AvatarInfo } from '@okr/shared-models';

export type ChatRoomType = 'direct' | 'adhoc' | 'pinboard';
export const PINBOARD_DESCRIPTION_MAX = 500;

/**
 * Eingabemodell des Chat-Formulars (planning/specs/2026-09-01-adhoc-chats-spec.md,
 * Pinnwand: spec 2026-10-11 §5.1).
 *
 * Bewusst KEIN Firestore-Modell: das Dokument ist ein `GroupModel` mit `kind: 'chat'`
 * bzw. `'pinboard'`, und angelegt wird es serverseitig. Der Client sammelt nur diese Angaben ein.
 */
export interface AdhocChatFormModel {
  /** Was angelegt wird — die Auswahl «Raumtyp» im Modal. */
  roomType: ChatRoomType;
  /** Pflicht bei 'adhoc' und 'pinboard'; bei 'direct' verworfen. */
  name: string;
  /** 'direct': genau eine Person; 'adhoc': zwei bis 19; 'pinboard': leer. OHNE die anlegende Person. */
  members: AvatarInfo[];
  /** Nur 'pinboard': Beschreibung = Raumthema. */
  description: string;
  /** Nur 'pinboard': die Quellgruppen. */
  sourceGroups: AvatarInfo[];
  /** Nur 'pinboard'. */
  joinMode: 'optOut' | 'optIn';
  /** Nur 'pinboard': «Antworten an alle zulassen». */
  allowReplyAll: boolean;
}

/** Hoechstzahl Mitglieder; gespiegelt aus ADHOC_CHAT_MAX_MEMBERS in der Cloud Function. */
export const ADHOC_CHAT_MAX_MEMBERS = 20;

/** Ein frisches, leeres Formular — je Aufruf ein neues Objekt, nie eine geteilte Konstante. */
export function newAdhocChatForm(roomType: ChatRoomType = 'direct'): AdhocChatFormModel {
  return { roomType, name: '', members: [], description: '', sourceGroups: [], joinMode: 'optOut', allowReplyAll: false };
}
