import { describe, expect, it } from 'vitest';
import type { VcardRecord } from '@okr/vcard-util';

import { hasLookupChannel, isRebuildDue, lookupAddresses, planBookWrites, renderBookCard } from './book';
import type { BookCard } from './dav-handler';

const NOW = new Date('2026-11-15T03:15:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe('isRebuildDue', () => {
  it.each([
    ['weekly 6 days', ago(6 * 24), 'weekly', false],
    ['weekly 7 days', ago(7 * 24), 'weekly', true],
    ['missing interval reads weekly', ago(6 * 24), undefined, false],
    ['daily 20 h', ago(20), 'daily', true],
    ['daily 10 h', ago(10), 'daily', false],
    ['manual', ago(1000), 'manual', false],
    ['never built', undefined, 'weekly', true],
    ['never built, manual', undefined, 'manual', false],
  ])('%s', (_l, builtAt, interval, due) => {
    expect(isRebuildDue(builtAt as string | undefined, interval as never, NOW)).toBe(due);
  });

  it('rebuilds a book whose cards no longer match its index, whatever the interval', () => {
    expect(isRebuildDue(ago(1), 'manual', NOW, true)).toBe(true);
    expect(isRebuildDue(ago(1), 'weekly', NOW, true)).toBe(true);
  });
});

const card = (uid: string, etag: string): BookCard => ({ uid, etag, vcardText: '', avatarPath: '', avatarVersion: '' });

describe('planBookWrites', () => {
  it('writes changed and new cards, deletes departed ones, skips unchanged', () => {
    const plan = planBookWrites({ a: '"1"', b: '"2"', gone: '"3"' }, [card('a', '"1"'), card('b', '"2x"'), card('new', '"4"')]);
    expect(plan.upserts.map((c) => c.uid)).toEqual(['b', 'new']);
    expect(plan.deletes).toEqual(['gone']);
  });
});

const PERSON: VcardRecord = {
  kind: 'person', uid: 'person-p1', firstName: 'Anna', lastName: 'Muster', displayName: 'Anna Muster',
  channels: [{ channel: 'phone', pref: true, value: '+41791234567' }], relatedNames: [],
};

describe('renderBookCard', () => {
  it('changes the ETag when one phone changes', async () => {
    const a = await renderBookCard(PERSON, '', '');
    const b = await renderBookCard({ ...PERSON, channels: [{ channel: 'phone', pref: true, value: '+41791234568' }] }, '', '');
    expect(a.etag).not.toBe(b.etag);
    expect(a.uid).toBe('person-p1');
    expect(a.vcardText).not.toContain('PHOTO');
  });

  it('changes the ETag with a new avatar version only', async () => {
    const a = await renderBookCard(PERSON, 'avatars/p1.jpg', '2026-11-01T00:00:00.000Z');
    const b = await renderBookCard(PERSON, 'avatars/p1.jpg', '2026-11-14T00:00:00.000Z');
    expect(a.vcardText).toBe(b.vcardText);
    expect(a.etag).not.toBe(b.etag);
  });
});

describe('hasLookupChannel', () => {
  it('needs a phone or an email', () => {
    expect(hasLookupChannel(PERSON)).toBe(true);
    expect(hasLookupChannel({ ...PERSON, channels: [{ channel: 'postal', pref: false }] })).toBe(false);
    expect(hasLookupChannel({ ...PERSON, channels: [] })).toBe(false);
  });
});

describe('lookupAddresses — favourites only (owner, 2026-11-17)', () => {
  const a = (addressChannel: string, value: Record<string, unknown>, isFavorite = false, isCc = false) => ({ addressChannel, isFavorite, isCc, ...value });

  it('keeps the favourite of each channel and drops the rest', () => {
    const { addresses } = lookupAddresses([
      a('email', { email: 'elab@x.ch' }), a('email', { email: 'fav@x.ch' }, true), a('email', { email: 'other@x.ch' }),
      a('phone', { phone: '+41 79 000 00 01' }, true), a('phone', { phone: '+41 79 000 00 02' }),
      a('postal', { streetName: 'Rainstrasse' }, true), a('web', { url: 'https://x.ch' }, true),
    ]);
    expect(addresses.map((x) => x['email'] ?? x['phone'] ?? x['streetName'] ?? x['url'])).toEqual(['fav@x.ch', '+41 79 000 00 01', 'Rainstrasse', 'https://x.ch']);
  });

  it('falls back to the first non-CC address of a channel with no favourite', () => {
    const { addresses } = lookupAddresses([a('phone', { phone: 'cc' }, false, true), a('phone', { phone: 'first' }), a('phone', { phone: 'second' })]);
    expect(addresses.map((x) => x['phone'])).toEqual(['first']);
  });

  it('turns the favourite bank account into a note with its label', () => {
    const { addresses, note } = lookupAddresses([a('bankaccount', { iban: 'CH98 0070 0112 9000 6934 5', addressChannelLabel: 'ZKB priv' }, true)]);
    expect(note).toBe('IBAN ZKB priv: CH98 0070 0112 9000 6934 5');
    expect(addresses).toEqual([]);
  });

  it('writes a bare IBAN when the account has no label', () => {
    expect(lookupAddresses([a('bankaccount', { iban: 'CH12' })]).note).toBe('IBAN: CH12');
  });
});
