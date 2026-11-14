import { JournalChange, JournalChangeOp, JournalEntity } from '@okr/shared-models';
import { isBases } from './journal-change.util';
import { isJournalLock, JournalLock } from './journal-lock.util';
import { entityStateKey, JournalState, viewOf } from './journal-merge.util';
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
  | { t: 'photoReq'; journalKey: string; files: string[] }
  | { t: 'lock'; journalKey: string; lock: JournalLock };

export const PEER_RECORD_PAGE = 200;

const ENTITIES: JournalEntity[] = ['journal', 'footprint', 'section', 'image', 'comment', 'reaction', 'track'];
const OPS: JournalChangeOp[] = ['create', 'set', 'archive'];
/** Photo files and the web version of a video clip (`<name>-video.mp4`, same rule as the sync lists). */
const FILE_NAME = /^[A-Za-z0-9_-]{1,100}\.jpg$|^[A-Za-z0-9_-]{1,94}-video\.mp4$/;

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
    case 'lock': {
      const l = m['lock'];
      if (!isJournalLock(l, journalKey)) return undefined;
      return { t: 'lock', journalKey, lock: { journalKey, entityKey: l.entityKey, personKey: l.personKey, name: l.name, until: l.until } };
    }
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
    .map(({ id, journalKey: jk, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields, bases }) => {
      const base = { id, journalKey: jk, deviceId, seq, hlc, authorKey, entity, entityKey, op, fields };
      return isBases(bases) ? { ...base, bases } : base;
    })
    .filter((c) => acceptRecord(c, nowMs));
}

/**
 * The journal's authors as this device knows them: the creator (owner of the `journal` entity) plus its `authorKeys`.
 * Undefined while the device does not hold the journal entity yet (nothing to check against).
 */
export function journalAuthorKeys(state: JournalState, journalKey: string): string[] | undefined {
  const entity = state[entityStateKey('journal', journalKey)];
  const view = viewOf(entity);
  if (!entity || !view) return undefined;
  const listed = Array.isArray(view['authorKeys']) ? (view['authorKeys'] as unknown[]).filter((k): k is string => typeof k === 'string' && k !== '') : [];
  return [...new Set([entity.ownerKey ?? '', ...listed].filter((k) => k !== ''))];
}

/**
 * Peer records whose author is an author of the journal (spec 1.154 phase 5, review fix). A record of anybody else would
 * be refused by the server when this device uploads it (rules: authorKey ∈ authorKeys) — and a refused upload stops the
 * whole journal's uploads every round. `authors` = journalAuthorKeys of this device's state; undefined = not known yet →
 * everything passes (the device holds no journal to protect). `journal` records of an author may add authors (co-author
 * added): their `authorKeys` count for the records after them in the same page, so the new author's first records,
 * arriving together with the record that adds them, are kept. Authors are only ever added here, never removed: a removal
 * is decided by the server at upload time.
 */
export function fromJournalAuthors(records: JournalChange[], authors: string[] | undefined): JournalChange[] {
  if (!authors) return records;
  const known = new Set(authors);
  const kept: JournalChange[] = [];
  for (const record of records) {
    if (!known.has(record.authorKey)) continue;
    kept.push(record);
    const added = record.entity === 'journal' ? record.fields['authorKeys'] : undefined;
    if (Array.isArray(added)) for (const key of added) if (typeof key === 'string' && key !== '') known.add(key);
  }
  return kept;
}
