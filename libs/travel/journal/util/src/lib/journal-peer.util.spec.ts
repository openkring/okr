import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { acceptPeerRecords, missingFor, parsePeerMessage, versionVector } from './journal-peer.util';

const NOW = 1_800_000_000_000;
function rec(deviceId: string, seq: number, journalKey = 'j1', wall = NOW - 1000): JournalChange {
  return {
    id: `${deviceId}-${seq}`, journalKey, deviceId, seq, hlc: formatHlc({ wall: wall + seq, counter: 0, deviceId }),
    authorKey: 'bruno', entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: `t${seq}` },
  };
}

describe('journal peer util', () => {
  it('vector is the highest contiguous seq per device', () => {
    const changes = [rec('a', 1), rec('a', 2), rec('a', 3), rec('b', 1), rec('x', 1, 'other')];
    expect(versionVector(changes, 'j1')).toEqual({ a: 3, b: 1 });
  });

  it('vector stops at a gap', () => {
    expect(versionVector([rec('a', 1), rec('a', 2), rec('a', 4), rec('b', 2)], 'j1')).toEqual({ a: 2, b: 0 });
  });

  it('missingFor sends only what the peer lacks, in seq order', () => {
    const changes = [rec('a', 3), rec('a', 1), rec('b', 1), rec('a', 2), rec('x', 1, 'other')];
    expect(missingFor(changes, 'j1', { a: 1 }).map((c) => c.id)).toEqual(['a-2', 'a-3', 'b-1']);
  });

  it('a message for another journal is rejected', () => {
    expect(parsePeerMessage(JSON.stringify({ t: 'vv', journalKey: 'j2', vv: {} }), 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'vv', journalKey: 'j1', vv: { a: 3, b: 'x' } }), 'j1')).toEqual({ t: 'vv', journalKey: 'j1', vv: { a: 3 } });
    expect(parsePeerMessage(JSON.stringify({ t: 'photoReq', journalKey: 'j1', files: ['a-400.jpg', '../x.jpg'] }), 'j1'))
      .toEqual({ t: 'photoReq', journalKey: 'j1', files: ['a-400.jpg'] });
    expect(parsePeerMessage('not json', 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'other', journalKey: 'j1' }), 'j1')).toBeUndefined();
  });

  it('malformed records are dropped', () => {
    const good = rec('a', 1);
    const records = [good, { ...good, id: 'x', seq: 'one' }, { ...rec('a', 2), journalKey: 'other' }, null, { ...rec('a', 3), hlc: 'bad' }];
    expect(acceptPeerRecords(records, 'j1', NOW).map((c) => c.id)).toEqual(['a-1']);
  });

  it('a record 25 h in the future is dropped', () => {
    const future = rec('a', 1, 'j1', NOW + 25 * 60 * 60 * 1000);
    expect(acceptPeerRecords([future, rec('a', 2)], 'j1', NOW).map((c) => c.id)).toEqual(['a-2']);
  });

  it('acceptPeerRecords keeps a valid bases map and drops a malformed one', () => {
    const good = { ...rec('a', 1), bases: { title: 'h1' } };
    const bad = { ...rec('a', 2), bases: { title: 5 } };
    const notObject = { ...rec('a', 3), bases: 'x' };
    const out = acceptPeerRecords([good, bad, notObject], 'j1', NOW);
    expect(out.map((c) => c.bases)).toEqual([{ title: 'h1' }, undefined, undefined]);
    expect('bases' in out[1]).toBe(false);
  });

  it('parsePeerMessage accepts lock and rejects a malformed lock', () => {
    const lock = { journalKey: 'j1', entityKey: 'f1', personKey: 'anna', name: 'Anna', until: NOW };
    expect(parsePeerMessage(JSON.stringify({ t: 'lock', journalKey: 'j1', lock }), 'j1')).toEqual({ t: 'lock', journalKey: 'j1', lock });
    expect(parsePeerMessage(JSON.stringify({ t: 'lock', journalKey: 'j1', lock: { ...lock, until: 'x' } }), 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'lock', journalKey: 'j1', lock: { ...lock, entityKey: '' } }), 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'lock', journalKey: 'j1', lock: { ...lock, journalKey: 'other' } }), 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'lock', journalKey: 'j1' }), 'j1')).toBeUndefined();
  });
});
