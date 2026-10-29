import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc, isValidHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import {
  commentsOf, digestOf, findGuestLink, guestChangeRecord, guestDeviceId, guestFootprintsOf, guestLinkState, likeKey, likesOf,
} from './journal-guest.util';
import { footprintsOf } from './journal-view.util';

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, authorKey = 'bruno', deviceId = 'dev-a'): JournalChange {
  n += 1;
  return { id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: formatHlc({ wall: 1000 + n, counter: 0, deviceId }), authorKey, fields: {}, ...p };
}

const CODE = 'a'.repeat(32);

describe('journal guests', () => {
  it('a revoked or expired link is refused', () => {
    const links = [{ personKey: 'anna', linkCode: CODE }];
    expect(guestLinkState(findGuestLink(links, CODE), '2027-01-10T00:00:00Z')).toBe('ok');
    expect(guestLinkState(findGuestLink(links, 'short'), '2027-01-10T00:00:00Z')).toBe('unknown');
    expect(guestLinkState({ ...links[0], revokedAt: '2027-01-01T00:00:00Z' }, '2027-01-10T00:00:00Z')).toBe('revoked');
    expect(guestLinkState({ ...links[0], expiresAt: '2027-01-05T00:00:00Z' }, '2027-01-10T00:00:00Z')).toBe('expired');
    expect(guestLinkState({ ...links[0], expiresAt: '2027-02-01T00:00:00Z' }, '2027-01-10T00:00:00Z')).toBe('ok');
  });

  it('a guest record has a valid clock of the guest device', () => {
    const r = guestChangeRecord({ id: 'c1', journalKey: 'j1', personKey: 'anna', entity: 'comment', entityKey: 'k1', op: 'create', fields: { text: 'Hallo' }, seq: 3, nowMs: 1_800_000_000_000 });
    expect(r.deviceId).toBe(guestDeviceId('anna'));
    expect(isValidHlc(r.hlc, r.deviceId)).toBe(true);
    expect(r.authorKey).toBe('anna');
    expect(r.seq).toBe(3);
  });

  it('comments of a footprint, oldest first, archived ones gone', () => {
    const state = materialize([
      rec({ entity: 'comment', entityKey: 'c2', op: 'create', fields: { footprintKey: 'f1', text: 'zwei', authorName: 'Anna', createdAt: '2027-01-14T10:00:00Z' } }, 'anna', 'guest-anna'),
      rec({ entity: 'comment', entityKey: 'c1', op: 'create', fields: { footprintKey: 'f1', text: 'eins', authorName: 'Bruno', createdAt: '2027-01-14T09:00:00Z' } }),
      rec({ entity: 'comment', entityKey: 'c3', op: 'create', fields: { footprintKey: 'f2', text: 'anderer', createdAt: '2027-01-14T09:30:00Z' } }),
      rec({ entity: 'comment', entityKey: 'c4', op: 'create', fields: { footprintKey: 'f1', text: 'weg', createdAt: '2027-01-14T11:00:00Z' } }),
      rec({ entity: 'comment', entityKey: 'c4', op: 'archive' }),
    ]);
    expect(commentsOf(state, 'f1').map((c) => [c.text, c.authorKey])).toEqual([['eins', 'bruno'], ['zwei', 'anna']]);
  });

  it('a like counts once and an unlike removes it', () => {
    const state = materialize([
      rec({ entity: 'reaction', entityKey: likeKey('f1', 'anna'), op: 'create', fields: { footprintKey: 'f1', type: 'like' } }, 'anna', 'guest-anna'),
      rec({ entity: 'reaction', entityKey: likeKey('f1', 'anna'), op: 'create', fields: { footprintKey: 'f1', type: 'like' } }, 'anna', 'guest-anna'),
      rec({ entity: 'reaction', entityKey: likeKey('f1', 'bruno'), op: 'create', fields: { footprintKey: 'f1', type: 'like' } }),
      rec({ entity: 'reaction', entityKey: likeKey('f1', 'bruno'), op: 'archive' }),
    ]);
    expect(likesOf(state, 'f1')).toEqual(['anna']);
  });

  it('the digest lists published footprints with updates and new comments, never drafts', () => {
    const base = [
      rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko', date: '20270114', publishState: 'published' } }),
      rec({ entity: 'footprint', entityKey: 'f2', op: 'create', fields: { journalKey: 'j1', title: 'Entwurf', date: '20270115', publishState: 'draft' } }),
      rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'photos', imageKeys: ['i1'], order: 'V' } }),
      rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f2', kind: 'text', html: '<p>x</p>', order: 'V' } }),
    ];
    const fresh = [
      rec({ entity: 'image', entityKey: 'i1', op: 'create', fields: { journalKey: 'j1' } }),
      rec({ entity: 'section', entityKey: 's2', op: 'set', fields: { html: '<p>y</p>' } }),
      rec({ entity: 'comment', entityKey: 'c1', op: 'create', fields: { footprintKey: 'f1', text: 'schön' } }, 'anna', 'guest-anna'),
      rec({ entity: 'comment', entityKey: 'c2', op: 'create', fields: { footprintKey: 'f1', text: 'wow' } }, 'eva', 'guest-eva'),
      rec({ entity: 'reaction', entityKey: likeKey('f1', 'eva'), op: 'create', fields: { footprintKey: 'f1', type: 'like' } }, 'eva', 'guest-eva'),
    ];
    const state = materialize([...base, ...fresh]);
    expect(digestOf(fresh, state, 'j1')).toEqual([{ footprintKey: 'f1', title: 'Neko', date: '20270114', updated: true, newComments: 2 }]);
    expect(digestOf([fresh[4]], state, 'j1')).toEqual([]); // a like alone is no news
  });

  it('guest view hides conflict copies and reminders', () => {
    const fp = rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko', date: '20270114', publishState: 'published' }, bases: {} });
    const draft = rec({ entity: 'footprint', entityKey: 'f2', op: 'create', fields: { journalKey: 'j1', title: 'Entwurf', date: '20270115' }, bases: {} });
    const c = rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', kind: 'photos', imageKeys: ['i1'], order: 'V' }, bases: {} });
    const anna = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { imageKeys: ['i2'] }, bases: { imageKeys: c.hlc } }, 'anna', 'dev-b');
    const bruno = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { imageKeys: ['i3'] }, bases: { imageKeys: c.hlc } });
    const titleA = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Harbour' }, bases: { title: fp.hlc } }, 'anna', 'dev-b');
    const titleB = rec({ entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'Neko Bay' }, bases: { title: fp.hlc } });
    const state = materialize([fp, draft, c, anna, bruno, titleA, titleB]);
    expect(footprintsOf(state, 'j1')[0].blocks).toHaveLength(2); // the authors see the copy and the reminder
    expect(footprintsOf(state, 'j1')[0].lostValues).toHaveLength(1);

    const guest = guestFootprintsOf(state, 'j1');
    expect(guest.map((f) => f.key)).toEqual(['f1']);
    expect(guest[0].blocks.map((b) => [b.key, b.imageKeys, b.conflict])).toEqual([['s1', ['i3'], false]]);
    expect(guest[0].lostValues).toEqual([]);

    const imageOfCopy = rec({ entity: 'image', entityKey: 'i2', op: 'create', fields: { journalKey: 'j1' } });
    expect(digestOf([imageOfCopy], materialize([fp, draft, c, anna, bruno, imageOfCopy]), 'j1')).toEqual([]);
  });
});
