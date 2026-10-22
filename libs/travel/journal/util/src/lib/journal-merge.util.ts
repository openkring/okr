import { JournalChange, JournalEntity } from '@okr/shared-models';
import { compareHlc } from './journal-hlc.util';

/**
 * Field-level merge of the travel-journal change log (spec 1.113 §5.2).
 *
 * - Last writer wins per field, by HLC (the deviceId inside the HLC breaks ties).
 * - Commutative and idempotent: any order of the same records gives the same state.
 * - Owned entities (a block, a comment, a like, a photo) take values only from their owner, the
 *   author of the create record. Records from anyone else stay in the state but never win.
 * - Delete is `op: 'archive'`, a tombstone field.
 *
 * Every field keeps its best candidate PER AUTHOR, so the owner's latest value is still known when a
 * non-owner's record carries a higher clock — and a `set` that arrives before its `create` is kept.
 */
export const OWNED_ENTITIES: JournalEntity[] = ['section', 'comment', 'reaction', 'image'];

const ARCHIVED_FIELD = 'archived';

export interface FieldCandidate { value: unknown; hlc: string; authorKey: string }

export interface EntityState {
  entity: JournalEntity;
  entityKey: string;
  ownerKey?: string; // authorKey of the create record
  ownerHlc?: string; // hlc of that create record; the earliest create decides the owner
  created: boolean;
  fields: Record<string, Record<string, FieldCandidate>>; // field → authorKey → best candidate
}

export type JournalState = Record<string, EntityState>; // key `${entity}:${entityKey}`

export function entityStateKey(entity: JournalEntity, entityKey: string): string {
  return `${entity}:${entityKey}`;
}

export function applyChange(state: JournalState, change: JournalChange): JournalState {
  const key = entityStateKey(change.entity, change.entityKey);
  const current: EntityState = state[key] ?? { entity: change.entity, entityKey: change.entityKey, created: false, fields: {} };
  const next: EntityState = { ...current, fields: { ...current.fields } };

  if (change.op === 'create') {
    next.created = true;
    if (next.ownerHlc === undefined || compareHlc(change.hlc, next.ownerHlc) < 0) {
      next.ownerKey = change.authorKey;
      next.ownerHlc = change.hlc;
    }
  }

  const values = change.op === 'archive' ? { [ARCHIVED_FIELD]: true } : change.fields;
  for (const [field, value] of Object.entries(values)) {
    const byAuthor = next.fields[field] ?? {};
    const best = byAuthor[change.authorKey];
    if (!best || compareHlc(change.hlc, best.hlc) > 0) {
      next.fields[field] = { ...byAuthor, [change.authorKey]: { value, hlc: change.hlc, authorKey: change.authorKey } };
    }
  }
  return { ...state, [key]: next };
}

export function materialize(changes: JournalChange[]): JournalState {
  return changes.reduce<JournalState>((state, change) => applyChange(state, change), {});
}

/** The visible values of an entity; undefined until its create record arrived, or once archived. */
export function viewOf(entity: EntityState | undefined): Record<string, unknown> | undefined {
  if (!entity || !entity.created) return undefined;
  const owned = OWNED_ENTITIES.includes(entity.entity);
  const view: Record<string, unknown> = {};
  for (const [field, byAuthor] of Object.entries(entity.fields)) {
    let winner: FieldCandidate | undefined;
    for (const candidate of Object.values(byAuthor)) {
      if (owned && candidate.authorKey !== entity.ownerKey) continue;
      if (!winner || compareHlc(candidate.hlc, winner.hlc) > 0) winner = candidate;
    }
    if (winner) view[field] = winner.value;
  }
  if (view[ARCHIVED_FIELD] === true) return undefined;
  return view;
}
