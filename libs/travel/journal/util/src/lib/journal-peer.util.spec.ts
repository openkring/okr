import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { guestDeviceId } from './journal-guest.util';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { acceptPeerRecords, fromJournalAuthors, journalAuthorKeys, missingFor, parsePeerMessage, versionVector } from './journal-peer.util';

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
    expect(parsePeerMessage(JSON.stringify({ t: 'photoReq', journalKey: 'j1', files: ['ab-video.mp4', '../x-video.mp4', 'ab.mp4', 'ab-2048.jpg'] }), 'j1'))
      .toEqual({ t: 'photoReq', journalKey: 'j1', files: ['ab-video.mp4', 'ab-2048.jpg'] });
    expect(parsePeerMessage('not json', 'j1')).toBeUndefined();
    expect(parsePeerMessage(JSON.stringify({ t: 'other', journalKey: 'j1' }), 'j1')).toBeUndefined();
  });

  it('malformed records are dropped', () => {
    const good = rec('a', 1);
    const records = [good, { ...good, id: 'x', seq: 'one' }, { ...rec('a', 2), journalKey: 'other' }, null, { ...rec('a', 3), hlc: 'bad' }];
    expect(acceptPeerRecords(records, 'j1', NOW).map((c) => c.id)).toEqual(['a-1']);
  });

  it('a track record from a peer (the iPhone sending a trip, phase 5) is accepted', () => {
    const track = { ...rec('phone', 1), entity: 'track' as const, entityKey: 'trk__j1__t1', op: 'create' as const, fields: { journalKey: 'j1' } };
    expect(acceptPeerRecords([track], 'j1', NOW).map((c) => c.entity)).toEqual(['track']);
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

describe('peer records only from the journal\'s authors (upload wedge guard)', () => {
  const journal = (authorKey: string, op: 'create' | 'set', authorKeys: string[], seq: number): JournalChange => ({
    ...rec('d-' + authorKey, seq), authorKey, entity: 'journal', entityKey: 'j1', op, fields: { title: 'T', authorKeys },
  });
  const by = (authorKey: string, seq: number): JournalChange => ({ ...rec('d-' + authorKey, seq), authorKey });

  it('knows the creator and the listed co-authors', () => {
    const log = [journal('bruno', 'create', [], 1), journal('bruno', 'set', ['anna'], 2)];
    expect(journalAuthorKeys(materialize(log), 'j1', log)?.sort()).toEqual(['anna', 'bruno']);
    expect(journalAuthorKeys(materialize(log), 'j2', log)).toBeUndefined();
  });

  it('still knows a co-author who was removed later (their earlier records keep travelling)', () => {
    const log = [journal('bruno', 'create', [], 1), journal('bruno', 'set', ['anna'], 2), journal('bruno', 'set', [], 3)];
    expect(journalAuthorKeys(materialize(log), 'j1', log)?.sort()).toEqual(['anna', 'bruno']);
  });

  it('drops a record of somebody who is not an author (the server would refuse its upload and stop the journal)', () => {
    expect(fromJournalAuthors([by('bruno', 1), by('mallory', 1)], ['bruno', 'anna']).map((r) => r.authorKey)).toEqual(['bruno']);
  });

  it('keeps a new co-author\'s records of the same page wherever the record adding them sits (order-independent)', () => {
    const page = [by('anna', 1), journal('bruno', 'set', ['anna'], 5), by('anna', 2)];
    expect(fromJournalAuthors(page, ['bruno']).map((r) => `${r.authorKey}${r.seq}`)).toEqual(['anna1', 'bruno5', 'anna2']);
  });

  it('follows a chain of added authors to the end (bruno adds anna, anna adds carl)', () => {
    const page = [by('carl', 1), journal('anna', 'set', ['anna', 'carl'], 3), journal('bruno', 'set', ['anna'], 2)];
    expect(fromJournalAuthors(page, ['bruno'])).toHaveLength(3);
  });

  it('keeps a removed co-author\'s old record (they are still among the known authors)', () => {
    const log = [journal('bruno', 'create', [], 1), journal('bruno', 'set', ['anna'], 2), journal('bruno', 'set', [], 3)];
    const authors = journalAuthorKeys(materialize(log), 'j1', log);
    expect(fromJournalAuthors([by('anna', 1)], authors)).toHaveLength(1);
  });

  it('keeps a guest\'s comment and like (server-written on the guest device), but not a guest-looking footprint', () => {
    const guest = (entity: 'comment' | 'reaction' | 'footprint'): JournalChange => ({
      ...rec(guestDeviceId('gina'), 1), authorKey: 'gina', entity, entityKey: 'x1',
    });
    const kept = fromJournalAuthors([guest('comment'), guest('reaction'), guest('footprint')], ['bruno']);
    expect(kept.map((r) => r.entity)).toEqual(['comment', 'reaction']);
    // a comment of a non-author on another device id is still dropped
    expect(fromJournalAuthors([{ ...rec('d-gina', 1), authorKey: 'gina', entity: 'comment' }], ['bruno'])).toEqual([]);
  });

  it('a journal record of a non-author cannot add authors', () => {
    const page = [journal('mallory', 'set', ['mallory'], 1), by('mallory', 2)];
    expect(fromJournalAuthors(page, ['bruno'])).toEqual([]);
  });

  it('passes everything while the device does not know the journal yet', () => {
    expect(fromJournalAuthors([by('mallory', 1)], undefined)).toHaveLength(1);
  });
});
