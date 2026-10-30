import { logger } from 'firebase-functions/v2';
import {
  JournalChange, JournalCollection, JournalCommentCollection, JournalEntity, JournalFootprintCollection, JournalImageCollection,
  JournalReactionCollection, JournalSectionCollection,
} from '@okr/shared-models';
import {
  acceptRecord, blocksOf, commentDocOf, conflictCopyDocOf, isConflictCopyKey, originalOfCopy, entityStateKey, footprintPageOf, imageDocOf, journalDocOf, materialize, reactionDocOf, sectionDocOf, sortByOrder, viewOf,
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

/**
 * The block's documents (spec 1.126 §6.3): the original plus one per conflict copy. `records` are
 * every record of the original key and of its copy keys; `existingCopyKeys` the copy docs stored
 * already. A stored copy that is not live now — archived, or its value is no longer lost — is
 * written `{ isArchived: true }`. Nothing is written before the original's create arrived.
 * `footprintKey` is read from the unarchived state: the footprint of an archived block is still wanted.
 */
export function planSectionWrites(
  records: StoredRecord[], journalKey: string, blockKey: string, tenants: string[], existingCopyKeys: string[],
): { writes: JournalWrite[]; footprintKey?: string } {
  const original = planEntityWrite(records.filter((r) => r.change.entityKey === blockKey), journalKey, 'section', blockKey, tenants);
  if (!original) return { writes: [] };
  const writes: JournalWrite[] = [original];
  const state = materialize(records.filter((r) => acceptRecord(r.change, r.uploadedAtMs)).map((r) => r.change));
  const entity = state[entityStateKey('section', blockKey)];
  const unarchived = entity && { ...entity, fields: Object.fromEntries(Object.entries(entity.fields).filter(([field]) => field !== 'archived')) };
  const footprint = viewOf(unarchived)?.['footprintKey'];
  if (typeof footprint !== 'string') return { writes };
  const live = new Set<string>();
  for (const block of blocksOf(state, footprint).filter((b) => b.conflictOf === blockKey)) {
    if (!isJournalKey(block.key)) {
      logger.warn('planSectionWrites: conflict copy with an invalid key skipped', { journalKey, blockKey });
      continue;
    }
    live.add(block.key);
    writes.push({ path: journalPath(journalKey, JournalSectionCollection, block.key), data: { ...conflictCopyDocOf(block, footprint, journalKey, tenants) } });
  }
  const stored = new Set([...existingCopyKeys, ...records.map((r) => r.change.entityKey)]);
  for (const key of [...stored].sort()) {
    if (isConflictCopyKey(key) && originalOfCopy(key) === blockKey && isJournalKey(key) && !live.has(key)) {
      writes.push({ path: journalPath(journalKey, JournalSectionCollection, key), data: ARCHIVED });
    }
  }
  return { writes, footprintKey: footprint };
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

/** A book map rendered in the browser (`book-map-<name>.jpg`): the only files an upload may overwrite (ruling R9). */
export function isBookMapFileName(name: unknown): name is string {
  return typeof name === 'string' && /^book-map-[A-Za-z0-9_-]+\.jpg$/.test(name) && isJournalFileName(name);
}

/** Whether prepareJournalPhotoUploads hands out an upload URL for an object that exists already: only book maps, on request. */
export function mayOverwrite(name: string, overwrite: unknown): boolean {
  return overwrite === true && isBookMapFileName(name);
}

export function journalObjectPath(tenantId: string, journalKey: string, fileName: string): string {
  return `tenant/${tenantId}/journal/${journalKey}/${fileName}`;
}
