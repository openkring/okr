import { JournalChange, JournalEntity } from '@okr/shared-models';
import { compareHlc, isValidHlc } from './journal-hlc.util';

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
 *
 * A record whose hlc is malformed or names another device is ignored: the clock decides who wins and
 * who owns a block, so it must at least be the writer's own. Authors are trusted (only they can write
 * change records); the server additionally checks the author and clamps clocks from the future (spec §5.3).
 */
export const OWNED_ENTITIES: JournalEntity[] = ['comment', 'reaction', 'image'];

/**
 * Fields whose every written value is kept in `EntityState.history`, so a later step can offer the
 * losing values of a concurrent edit as a conflict copy. Sections are not owned: any author edits them.
 */
export const CONFLICT_FIELDS: Partial<Record<JournalEntity, string[]>> = {
  section: ['html', 'imageKeys'],
  footprint: ['title', 'placeName', 'date', 'time', 'latitude', 'longitude', 'publishState', 'transport'],
};

const ARCHIVED_FIELD = 'archived';

export interface FieldCandidate { value: unknown; hlc: string; authorKey: string }

export interface FieldRecord { value: unknown; hlc: string; authorKey: string; base?: string }

export interface EntityState {
  entity: JournalEntity;
  entityKey: string;
  ownerKey?: string; // authorKey of the create record
  ownerHlc?: string; // hlc of that create record; the earliest create decides the owner
  created: boolean;
  fields: Record<string, Record<string, FieldCandidate>>; // field → authorKey → best candidate
  history?: Record<string, FieldRecord[]>; // CONFLICT_FIELDS only: every create/set value, one per hlc, sorted by hlc ascending
}

export type JournalState = Record<string, EntityState>; // key `${entity}:${entityKey}`

export function entityStateKey(entity: JournalEntity, entityKey: string): string {
  return `${entity}:${entityKey}`;
}

export function applyChange(state: JournalState, change: JournalChange): JournalState {
  if (!isValidHlc(change.hlc, change.deviceId)) return state;
  const key = entityStateKey(change.entity, change.entityKey);
  const current: EntityState = state[key] ?? { entity: change.entity, entityKey: change.entityKey, created: false, fields: {} };
  const next: EntityState = { ...current, fields: { ...current.fields } };
  const conflictFields = change.op === 'archive' ? undefined : CONFLICT_FIELDS[change.entity];

  if (change.op === 'create') {
    next.created = true;
    if (next.ownerHlc === undefined || compareHlc(change.hlc, next.ownerHlc) < 0) {
      next.ownerKey = change.authorKey;
      next.ownerHlc = change.hlc;
    }
  }

  // `archived` is written by op 'archive' only; a create or set may not touch it (no un-archive by a stray field)
  const values = change.op === 'archive'
    ? { [ARCHIVED_FIELD]: true }
    : Object.fromEntries(Object.entries(change.fields).filter(([field]) => field !== ARCHIVED_FIELD));
  for (const [field, value] of Object.entries(values)) {
    const byAuthor = next.fields[field] ?? {};
    const best = byAuthor[change.authorKey];
    if (!best || compareHlc(change.hlc, best.hlc) > 0) {
      next.fields[field] = { ...byAuthor, [change.authorKey]: { value, hlc: change.hlc, authorKey: change.authorKey } };
    }
    if (conflictFields?.includes(field)) {
      const known = next.history?.[field] ?? [];
      if (!known.some((r) => r.hlc === change.hlc)) {
        const record: FieldRecord = { value, hlc: change.hlc, authorKey: change.authorKey };
        const base = change.bases?.[field];
        if (base !== undefined) record.base = base;
        next.history = { ...next.history, [field]: [...known, record].sort((a, b) => compareHlc(a.hlc, b.hlc)) };
      }
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
