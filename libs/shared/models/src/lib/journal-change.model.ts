import type { Timestamp } from 'firebase/firestore';

/**
 * One edit in a travel journal (spec 1.113 §5.1). Every device appends these to its local change
 * log; peers exchange them, and any online device uploads them to `journal-changes`, where a Cloud
 * Function merges them. The document id is `id`. Records are never updated or deleted.
 */
export type JournalEntity = 'journal' | 'footprint' | 'section' | 'image' | 'comment' | 'reaction';
export type JournalChangeOp = 'create' | 'set' | 'archive';

export interface JournalChange {
  id: string; // uuid
  journalKey: string;
  deviceId: string; // stable per installation
  seq: number; // per-device counter, 1, 2, 3 …
  hlc: string; // hybrid logical clock, see formatHlc in @okr/travel-journal-util
  authorKey: string; // person.okey of the author
  entity: JournalEntity;
  entityKey: string;
  op: JournalChangeOp;
  fields: Record<string, unknown>; // only the changed fields
  bases?: Record<string, string>; // field → hlc of the value this edit was made on top of (conflict detection)
  tenants?: string[]; // set by the uploader (the journal's tenant); absent in the local log
  uploadedAt?: Timestamp; // server time of the upload, set as serverTimestamp(); absent in the local log
}

export const JournalChangeCollection = 'journal-changes';
export const JournalChangeModelName = 'journalChange';
