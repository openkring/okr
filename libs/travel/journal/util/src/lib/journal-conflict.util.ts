import { compareHlc } from './journal-hlc.util';
import { CONFLICT_FIELDS, EntityState, FieldRecord } from './journal-merge.util';

/**
 * Concurrent edits of the travel journal (spec 1.126 §6.3). An offline edit of a block or a footprint
 * field never silently replaces another one: every value of a conflict field is kept in the field's
 * history, and a value nobody built on is "lost". A lost block value becomes a conflict copy of the
 * block, a lost footprint value a reminder. Everything here is derived from the merged state, so it
 * gives the same result for any delivery order of the change records.
 */
const COPY_MARK = '_c_';

/** An hlc as a key segment: ':' is not allowed in journal keys. */
export function hlcKeyPart(hlc: string): string {
  return hlc.replace(/:/g, '_');
}

/**
 * Non-winning values of a field that no record was based on; [] without history.
 * The winner is the entry with the highest hlc. A record without `base` (an older build) counts as
 * based on every earlier entry, so legacy logs never lose a value.
 */
export function lostValues(history: FieldRecord[] | undefined): FieldRecord[] {
  if (!history || history.length < 2) return [];
  const sorted = [...history].sort((a, b) => compareHlc(a.hlc, b.hlc));
  const bases = new Set(sorted.map((r) => r.base).filter((b): b is string => b !== undefined));
  let lastWithoutBase = -1;
  sorted.forEach((r, i) => { if (r.base === undefined) lastWithoutBase = i; });
  return sorted.filter((r, i) => i < sorted.length - 1 && !bases.has(r.hlc) && i >= lastWithoutBase);
}

/** The key of the conflict copy that holds the lost value written at `hlc`. */
export function conflictCopyKey(blockKey: string, hlc: string): string {
  return `${blockKey}${COPY_MARK}${hlcKeyPart(hlc)}`;
}

export function isConflictCopyKey(key: string): boolean {
  return key.includes(COPY_MARK);
}

/** The block a conflict copy was split from; the key itself for an ordinary block. */
export function originalOfCopy(key: string): string {
  const at = key.indexOf(COPY_MARK);
  return at < 0 ? key : key.slice(0, at);
}

/** The footprint field that hides one lost value (any author may dismiss it). */
export function dismissedField(hlc: string): string {
  return `dismissed_${hlcKeyPart(hlc)}`;
}

/** The hlc of the winning (latest) value of every conflict field the entity has. */
export function winningHlcs(entity: EntityState): Record<string, string> {
  const hlcs: Record<string, string> = {};
  for (const field of CONFLICT_FIELDS[entity.entity] ?? []) {
    let latest: string | undefined;
    for (const candidate of Object.values(entity.fields[field] ?? {})) {
      if (latest === undefined || compareHlc(candidate.hlc, latest) > 0) latest = candidate.hlc;
    }
    if (latest !== undefined) hlcs[field] = latest;
  }
  return hlcs;
}
