import { JournalChange, JournalChangeOp, JournalEntity } from '@okr/shared-models';

/**
 * A change record as SQLite stores it (fields as JSON text). Decoding never throws: a damaged row is
 * skipped, so one bad record cannot hide the whole journal (plan 2 final review).
 */
export interface StoredChangeRow {
  id: string; journalKey: string; deviceId: string; seq: number | string; hlc: string; authorKey: string;
  entity: string; entityKey: string; op: string; fields: string;
}

const ENTITIES: JournalEntity[] = ['journal', 'footprint', 'section', 'image', 'comment', 'reaction'];
const OPS: JournalChangeOp[] = ['create', 'set', 'archive'];

export function decodeChangeRow(row: StoredChangeRow): JournalChange | undefined {
  if (!ENTITIES.includes(row.entity as JournalEntity) || !OPS.includes(row.op as JournalChangeOp)) return undefined;
  let fields: unknown;
  try {
    fields = JSON.parse(row.fields);
  } catch {
    return undefined;
  }
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return undefined;
  return {
    id: row.id, journalKey: row.journalKey, deviceId: row.deviceId, seq: Number(row.seq), hlc: row.hlc,
    authorKey: row.authorKey, entity: row.entity as JournalEntity, entityKey: row.entityKey,
    op: row.op as JournalChangeOp, fields: fields as Record<string, unknown>,
  };
}
