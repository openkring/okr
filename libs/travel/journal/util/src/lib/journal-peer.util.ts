import { JournalChange, JournalChangeOp, JournalEntity } from '@okr/shared-models';
import { acceptRecord } from './journal-server.util';

/**
 * The protocol between two iPads of the same journal (spec 1.113 §5.4, plan 5). The connection is already
 * authenticated and encrypted (TLS with a key from the journal's peer secret); these rules only decide
 * WHAT is exchanged: version vectors, then the missing records in pages, then the missing photo files
 * (sent natively as binary frames, not through these messages).
 */
export type PeerMessage =
  | { t: 'vv'; journalKey: string; vv: Record<string, number> }
  | { t: 'records'; journalKey: string; records: unknown[] }
  | { t: 'photoReq'; journalKey: string; files: string[] };

export const PEER_RECORD_PAGE = 200;

const ENTITIES: JournalEntity[] = ['journal', 'footprint', 'section', 'image', 'comment', 'reaction'];
const OPS: JournalChangeOp[] = ['create', 'set', 'archive'];
const FILE_NAME = /^[A-Za-z0-9_-]{1,100}\.jpg$/;

/**
 * Per device the highest seq up to which this iPad holds EVERY record (the contiguous prefix). Records that
 * came from Firebase out of order leave gaps; reporting the max would make the peer skip the missing ones.
 */
export function versionVector(changes: JournalChange[], journalKey: string): Record<string, number> {
  const seqs = new Map<string, Set<number>>();
  for (const c of changes) {
    if (c.journalKey !== journalKey) continue;
    const set = seqs.get(c.deviceId) ?? new Set<number>();
    set.add(c.seq);
    seqs.set(c.deviceId, set);
  }
  const vv: Record<string, number> = {};
  for (const [deviceId, set] of seqs) {
    let n = 0;
    while (set.has(n + 1)) n += 1;
    vv[deviceId] = n;
  }
  return vv;
}

/** The journal's records the peer does not hold yet, by device and seq (the peer stores them in that order). */
export function missingFor(changes: JournalChange[], journalKey: string, peerVv: Record<string, number>): JournalChange[] {
  return changes
    .filter((c) => c.journalKey === journalKey && c.seq > (peerVv[c.deviceId] ?? 0))
    .sort((a, b) => (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : a.seq - b.seq));
}

export function parsePeerMessage(text: string, journalKey: string): PeerMessage | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const m = raw as Record<string, unknown>;
  if (m['journalKey'] !== journalKey) return undefined;
  switch (m['t']) {
    case 'vv': {
      const vv: Record<string, number> = {};
      const source = typeof m['vv'] === 'object' && m['vv'] !== null ? (m['vv'] as Record<string, unknown>) : {};
      for (const [deviceId, seq] of Object.entries(source)) {
        if (typeof seq === 'number' && Number.isInteger(seq) && seq >= 0) vv[deviceId] = seq;
      }
      return { t: 'vv', journalKey, vv };
    }
    case 'records':
      return Array.isArray(m['records']) ? { t: 'records', journalKey, records: m['records'] } : undefined;
    case 'photoReq':
      return Array.isArray(m['files'])
        ? { t: 'photoReq', journalKey, files: (m['files'] as unknown[]).filter((f): f is string => typeof f === 'string' && FILE_NAME.test(f)) }
        : undefined;
    default:
      return undefined;
  }
}

function isChange(r: unknown, journalKey: string): r is JournalChange {
  if (typeof r !== 'object' || r === null) return false;
  const c = r as Record<string, unknown>;
  return typeof c['id'] === 'string' && c['id'] !== '' && c['journalKey'] === journalKey
    && typeof c['deviceId'] === 'string' && typeof c['seq'] === 'number' && Number.isInteger(c['seq']) && (c['seq'] as number) > 0
    && typeof c['hlc'] === 'string' && typeof c['authorKey'] === 'string' && c['authorKey'] !== ''
    && ENTITIES.includes(c['entity'] as JournalEntity) && typeof c['entityKey'] === 'string' && c['entityKey'] !== ''
    && OPS.includes(c['op'] as JournalChangeOp) && typeof c['fields'] === 'object' && c['fields'] !== null && !Array.isArray(c['fields']);
}

/**
 * The records of a peer page this device stores: well-formed, of this journal, and with a clock the server
 * would accept too (not more than 24 h ahead of now) — so both iPads and Firebase merge the same set.
 */
export function acceptPeerRecords(records: unknown[], journalKey: string, nowMs: number): JournalChange[] {
  return records
    .filter((r): r is JournalChange => isChange(r, journalKey))
    .map(({ id, journalKey: jk, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields }) =>
      ({ id, journalKey: jk, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields }))
    .filter((c) => acceptRecord(c, nowMs));
}
