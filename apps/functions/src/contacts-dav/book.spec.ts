import { describe, expect, it } from 'vitest';
import type { VcardRecord } from '@okr/vcard-util';

import { hasLookupChannel, isRebuildDue, planBookWrites, renderBookCard } from './book';
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
