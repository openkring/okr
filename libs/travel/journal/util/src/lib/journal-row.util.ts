import { JournalChange, JournalChangeOp, JournalEntity } from '@okr/shared-models';
import { isBases } from './journal-change.util';

/**
 * A change record as SQLite stores it (fields as JSON text). Decoding never throws: a damaged row is
 * skipped, so one bad record cannot hide the whole journal (plan 2 final review).
 */
export interface StoredChangeRow {
  id: string; journalKey: string; deviceId: string; seq: number | string; hlc: string; authorKey: string;
  entity: string; entityKey: string; op: string; fields: string;
  bases?: string | null; // JSON; NULL on records without bases and on rows stored before spec 1.126 phase 2
}

const ENTITIES: JournalEntity[] = ['journal', 'footprint', 'section', 'image', 'comment', 'reaction'];
const OPS: JournalChangeOp[] = ['create', 'set', 'archive'];

/** The `bases` column value of a change: JSON, or NULL for a record without bases (legacy, latest wins). */
export function encodeBases(bases: Record<string, string> | undefined): string | null {
  return bases === undefined ? null : JSON.stringify(bases);
}

/** A damaged `bases` value drops the bases (the record then counts as legacy), never the record. */
function decodeBases(text: string | null | undefined): Record<string, string> | undefined {
  if (typeof text !== 'string') return undefined;
  try {
    const bases: unknown = JSON.parse(text);
    return isBases(bases) ? bases : undefined;
  } catch {
    return undefined;
  }
}

export function decodeChangeRow(row: StoredChangeRow): JournalChange | undefined {
  if (!ENTITIES.includes(row.entity as JournalEntity) || !OPS.includes(row.op as JournalChangeOp)) return undefined;
  let fields: unknown;
  try {
    fields = JSON.parse(row.fields);
  } catch {
    return undefined;
  }
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return undefined;
  const bases = decodeBases(row.bases);
  return {
    id: row.id, journalKey: row.journalKey, deviceId: row.deviceId, seq: Number(row.seq), hlc: row.hlc,
    authorKey: row.authorKey, entity: row.entity as JournalEntity, entityKey: row.entityKey,
    op: row.op as JournalChangeOp, fields: fields as Record<string, unknown>,
    ...(bases ? { bases } : {}),
  };
}
