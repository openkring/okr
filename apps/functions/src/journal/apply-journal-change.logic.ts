import {
  JournalChange, JournalCollection, JournalCommentCollection, JournalEntity, JournalFootprintCollection, JournalImageCollection,
  JournalReactionCollection, JournalSectionCollection,
} from '@okr/shared-models';
import {
  acceptRecord, commentDocOf, entityStateKey, footprintPageOf, imageDocOf, journalDocOf, materialize, reactionDocOf, sectionDocOf, sortByOrder,
} from '@okr/travel-journal-util';

/** A change record as stored in `journal-changes`, with its server upload time. */
export interface StoredRecord { change: JournalChange; uploadedAtMs: number }

/** A merge-write of one document. */
export interface JournalWrite { path: string; data: Record<string, unknown> }

const ARCHIVED = { isArchived: true };

export function journalPath(journalKey: string, sub?: string, key?: string): string {
  return sub && key ? `${JournalCollection}/${journalKey}/${sub}/${key}` : `${JournalCollection}/${journalKey}`;
}

/**
 * The document one entity materialises to, from ALL its records (spec 1.113 §5.3). Records with a
 * malformed or far-future clock are dropped. Nothing is written before the create record arrived (a set
 * can overtake its create); an archived entity becomes `isArchived: true` — never a delete (an unliked
 * like too).
 */
export function planEntityWrite(records: StoredRecord[], journalKey: string, entity: JournalEntity, entityKey: string, tenants: string[]): JournalWrite | undefined {
  // keys come from the device: a '/' would address a document outside the journal's subcollections
  if (!isJournalKey(journalKey) || !isJournalKey(entityKey)) return undefined;
  const state = materialize(records.filter((r) => acceptRecord(r.change, r.uploadedAtMs)).map((r) => r.change));
  if (!state[entityStateKey(entity, entityKey)]?.created) return undefined;
  switch (entity) {
    case 'journal':
      return { path: journalPath(journalKey), data: journalDocOf(state, journalKey, tenants) ?? ARCHIVED };
    case 'footprint':
      return { path: journalPath(journalKey, JournalFootprintCollection, entityKey), data: footprintPageOf(state, entityKey, tenants) ?? ARCHIVED };
    case 'section':
      return { path: journalPath(journalKey, JournalSectionCollection, entityKey), data: { ...(sectionDocOf(state, entityKey, journalKey, tenants) ?? ARCHIVED) } };
    case 'image':
      return { path: journalPath(journalKey, JournalImageCollection, entityKey), data: { ...(imageDocOf(state, entityKey, tenants) ?? ARCHIVED) } };
    case 'comment':
      return { path: journalPath(journalKey, JournalCommentCollection, entityKey), data: commentDocOf(state, entityKey, tenants) ?? ARCHIVED };
    case 'reaction':
      return { path: journalPath(journalKey, JournalReactionCollection, entityKey), data: reactionDocOf(state, entityKey, tenants) ?? ARCHIVED };
    default:
      return undefined;
  }
}

/** The footprint's `sections` list: its live blocks in their fractional order. */
export function planFootprintSections(journalKey: string, footprintKey: string, sections: { okey: string; order?: string; isArchived?: boolean }[]): JournalWrite {
  const live = sortByOrder(sections.filter((s) => s.isArchived !== true));
  return { path: journalPath(journalKey, JournalFootprintCollection, footprintKey), data: { sections: live.map((s) => s.okey) } };
}

/** A device-made key (a uuid): safe as one Firestore path segment. */
export function isJournalKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(key);
}

/** A photo file name as the device writes it (`<uuid>-2048.jpg`): no path, no traversal. */
export function isJournalFileName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9_-]{1,100}\.jpg$/.test(name);
}

export function journalObjectPath(tenantId: string, journalKey: string, fileName: string): string {
  return `tenant/${tenantId}/journal/${journalKey}/${fileName}`;
}
