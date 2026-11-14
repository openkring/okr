import { describe, expect, it } from 'vitest';
import { JournalChange } from '@okr/shared-models';
import { formatHlc, reactionKey } from '@okr/travel-journal-util';

import {
  applyManage, clipReadUrl, deliveryFor, feedbackIndex, feedbackTarget, GUEST_ROUTE_MAX_POINTS, GuestRequestError, GuestSection, guestReactionWrite, guestRoute,
  guestSectionFeedback, guestSectionsOf, guestTrackOf, guestVideoClips, isGuestVisibleSection, publishedGuestFootprints, wantsRoute, isOneEmoji, mayDeleteComment, memberName, parseGuestRequest, parseGuestEmail, peopleKeys,
} from './guest.logic';

const CODE = '0123456789abcdef0123456789abcdef';
const avatar = (key: string, name1: string, name2: string) => ({ key, name1, name2, modelType: 'person' as const, type: '', subType: '', label: '' });

describe('journal guest logic', () => {
  it('a request is checked before anything is read', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'view' })).toEqual({ journalKey: 'j1', code: CODE, action: 'view' });
    expect(() => parseGuestRequest({ journalKey: 'j1', code: 'short', action: 'view' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j/1', code: CODE, action: 'view' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'delete' })).toThrow(GuestRequestError);
  });

  it('a comment is trimmed, capped and needs a footprint', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: '  Schön!  ', authorName: 'Fake' }))
      .toEqual({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: 'Schön!' }); // extra fields are dropped
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: ' ' })).toThrow();
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: 'x'.repeat(2001) })).toThrow();
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'like' })).toThrow();
  });

  it('deleting needs a comment key', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: 'c1' }))
      .toEqual({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: 'c1' });
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: '../x' })).toThrow(GuestRequestError);
  });

  it('names come from the journal lists only', () => {
    const authors = [avatar('bruno', 'Bruno', 'Kaiser')];
    const guests = [{ person: avatar('anna', 'Anna', 'Muster') }];
    expect(memberName('bruno', authors, guests)).toBe('Bruno Kaiser');
    expect(memberName('anna', authors, guests)).toBe('Anna Muster');
    expect(memberName('mallory', authors, guests)).toBe('');
  });

  it('create reuses a live link, revoke and expiry change only that one', () => {
    let n = 0;
    const code = () => `${String(++n).padStart(32, '0')}`;
    const step1 = applyManage([], 'create', 'anna', '2027-01-01T00:00:00Z', code);
    expect(step1.link?.linkCode).toBe('0'.repeat(31) + '1');
    expect(applyManage(step1.links, 'create', 'anna', '2027-01-01T00:00:00Z', code).links).toHaveLength(1);
    const expiring = applyManage(step1.links, 'expiry', 'anna', '2027-01-01T00:00:00Z', code, '2027-03-01T00:00:00Z');
    expect(expiring.link?.expiresAt).toBe('2027-03-01T00:00:00Z');
    expect(applyManage(expiring.links, 'expiry', 'anna', '2027-01-01T00:00:00Z', code, null).link?.expiresAt).toBeUndefined();
    const revoked = applyManage(expiring.links, 'revoke', 'anna', '2027-01-02T00:00:00Z', code);
    expect(revoked.link?.revokedAt).toBe('2027-01-02T00:00:00Z');
    // after a revoke, create issues a new code
    expect(applyManage(revoked.links, 'create', 'anna', '2027-01-03T00:00:00Z', code).links).toHaveLength(2);
  });

  it('a settings request from an older client asking for signal gets email', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'settings', channel: 'signal' }).channel).toBe('email');
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'settings', channel: 'sms' })).toThrow(GuestRequestError);
  });

  it('the delivery choice', () => {
    expect(deliveryFor('email')).toEqual(['email']);
    expect(deliveryFor('none')).toEqual([]);
  });

  it('a guest never sees an open conflict copy or an archived block', () => {
    expect(isGuestVisibleSection({ footprintKey: 'f1' })).toBe(true);
    expect(isGuestVisibleSection({ footprintKey: 'f1', conflictOf: 's1', conflict: true })).toBe(false);
    expect(isGuestVisibleSection({ footprintKey: 'f1', isArchived: true })).toBe(false);
  });

  it('copy doc without conflict field is hidden from guests', () => {
    expect(isGuestVisibleSection({ footprintKey: 'f1', conflictOf: 's1' })).toBe(false);
  });

  it('a copy that outlived its original is a normal block for guests', () => {
    expect(isGuestVisibleSection({ footprintKey: 'f1', conflictOf: 's1', conflict: false })).toBe(true);
  });
});

describe('guestSectionsOf', () => {
  const docs = [
    { id: 'a1', data: { footprintKey: 'f1', type: 'album', title: 'Eis', content: { htmlContent: '' }, authorKey: 'bruno', properties: { images: [{ label: 'i2' }, { label: 'i1' }], imageStyle: { width: '100%' } } } },
    { id: 'h1', data: { footprintKey: 'f1', type: 'hero', title: '', content: { htmlContent: '' }, authorKey: 'anna', properties: { hero: { label: 'i3' }, overlay: { title: true } } } },
    { id: 'a1_c_x', data: { footprintKey: 'f1', type: 'album', conflictOf: 'a1', conflict: true, properties: { images: [{ label: 'i9' }] } } },
    { id: 'v1', data: { footprintKey: 'f1', type: 'video', content: { htmlContent: '<p>Pinguine</p>' }, properties: { clips: [{ label: 'c1' }] } } },
    { id: 'o1', data: { footprintKey: 'f2', type: 'article', content: { htmlContent: '<p>anderswo</p>' } } },
    { id: 'x1', data: { footprintKey: 'f1', type: 'tracker' } }, // a type the journal does not offer
    { id: 'z1', data: { footprintKey: 'f1', type: 'article', isArchived: true } },
  ];

  it('maps a hero and an album in footprint order, open conflict copies hidden', () => {
    const sections = guestSectionsOf(docs, 'f1', ['h1', 'a1', 'a1_c_x', 'v1']);
    expect(sections.map((s) => s.key)).toEqual(['h1', 'a1', 'v1']);
    expect(sections[0]).toEqual({
      key: 'h1', type: 'hero', title: '', html: '', authorKey: 'anna',
      properties: { hero: { label: 'i3' }, overlay: { title: true } }, imageKeys: ['i3'], clipKeys: [],
      feedback: { comments: false, reactions: false, imageComments: false, imageReactions: false },
    });
    expect(sections[1]).toMatchObject({ key: 'a1', type: 'album', title: 'Eis', imageKeys: ['i2', 'i1'], clipKeys: [] });
    expect(sections[2]).toMatchObject({ key: 'v1', type: 'video', html: '<p>Pinguine</p>', imageKeys: [], clipKeys: ['c1'] });
  });

  it('a copy that outlived its original is shown', () => {
    const outlived = [{ id: 'a1_c_x', data: { footprintKey: 'f1', type: 'album', conflictOf: 'a1', conflict: false, properties: { images: [{ label: 'i9' }] } } }];
    expect(guestSectionsOf(outlived, 'f1', ['a1_c_x']).map((s) => s.imageKeys)).toEqual([['i9']]);
  });
});

describe('map and track sections for guests (1.154 phase 5)', () => {
  const img = (lat: number, lng: number, takenAt: string, extra: Record<string, unknown> = {}) => ({
    latitude: lat, longitude: lng, takenAt, path2048: `tenant/t/journal/j/${takenAt}-2048.jpg`, path400: `tenant/t/journal/j/${takenAt}-400.jpg`, ...extra,
  });
  // imageById holds the LIVE images only (guestView filters archived ones out)
  const images = new Map<string, Record<string, unknown>>([
    ['p1', img(46.0, 7.0, '2026-11-01T09:00')],
    ['p2', img(46.1, 7.1, '2026-11-01T10:00')],
    ['d1', img(40.0, 1.0, '2026-11-01T09:30')], // only in a draft footprint
    ['z1', img(41.0, 2.0, '2026-11-01T09:40')], // only in an archived section of a published footprint
    ['v1', img(42.0, 3.0, '2026-11-01T09:50', { videoPath: 'tenant/t/journal/j/v1-video.mp4' })], // a clip
    ['t1', img(46.05, 7.05, '2026-11-01T09:20')], // a track photo
  ]);
  const footprints = [
    { id: 'f1', data: { publishState: 'published', sections: ['m1', 'a1', 'z1', 'k1'] } },
    { id: 'f2', data: { publishState: 'draft', sections: ['a2'] } },
    { id: 'f3', data: { publishState: 'published', isArchived: true, sections: ['a3'] } },
  ];
  const sectionDocs = [
    { id: 'm1', data: { footprintKey: 'f1', type: 'map', properties: { zoom: 12, layer: 'world', showRoute: true } } },
    { id: 'a1', data: { footprintKey: 'f1', type: 'album', properties: { images: [{ label: 'p2' }, { label: 'p1' }, { label: 'v1' }] } } },
    { id: 'z1', data: { footprintKey: 'f1', type: 'album', isArchived: true, properties: { images: [{ label: 'z1' }] } } },
    { id: 'k1', data: { footprintKey: 'f1', type: 'track', properties: { track: { trackKey: 'trk__j1__trip1' } } } },
    { id: 'a2', data: { footprintKey: 'f2', type: 'album', properties: { images: [{ label: 'd1' }] } } },
    { id: 'a3', data: { footprintKey: 'f3', type: 'album', properties: { images: [{ label: 'd1' }] } } },
  ];

  it('publishedGuestFootprints keeps live, published footprints with their visible sections', () => {
    const published = publishedGuestFootprints(footprints, sectionDocs);
    expect(published.map((p) => p.footprint.id)).toEqual(['f1']);
    expect(published[0].sections.map((s) => s.key)).toEqual(['m1', 'a1', 'k1']);
    expect(published[0].sections[0].properties).toEqual({ zoom: 12, layer: 'world', showRoute: true }); // layer sent as is
  });

  it('a track section names its track key; a key that is not one path segment is dropped', () => {
    const [track] = guestSectionsOf([sectionDocs[3]], 'f1', ['k1']);
    expect(track).toMatchObject({ type: 'track', trackKey: 'trk__j1__trip1', imageKeys: [] });
    const evil = guestSectionsOf([{ id: 'k2', data: { footprintKey: 'f1', type: 'track', properties: { track: { trackKey: '../../users/x' } } } }], 'f1', ['k2']);
    expect(evil[0].trackKey).toBeUndefined();
    expect('trackKey' in guestSectionsOf([sectionDocs[1]], 'f1', ['a1'])[0]).toBe(false);
  });

  it('Review Focus 4: the route holds only photo positions of published footprints, in time order, no clips', () => {
    const sections = publishedGuestFootprints(footprints, sectionDocs).flatMap((p) => p.sections);
    expect(wantsRoute(sections)).toBe(true);
    const route = guestRoute([...sections.flatMap((s) => s.imageKeys), 't1'], images);
    expect(route).toEqual([[46.0, 7.0], [46.05, 7.05], [46.1, 7.1]]);
    // the draft's, the archived section's and the clip's positions are nowhere
    expect(route.flat()).not.toContain(40.0);
    expect(route.flat()).not.toContain(41.0);
    expect(route.flat()).not.toContain(42.0);
    // an image that is not live (absent) adds nothing
    expect(guestRoute(['gone', 'p1'], images)).toEqual([[46.0, 7.0]]);
  });

  it('no map with showRoute, no route', () => {
    const sections = guestSectionsOf([{ id: 'm1', data: { footprintKey: 'f1', type: 'map', properties: { zoom: 12 } } }, sectionDocs[1]], 'f1', ['m1', 'a1']);
    expect(wantsRoute(sections)).toBe(false);
  });

  it('a long route is thinned to the cap, first and last point kept', () => {
    const many = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < 6000; i++) {
      const takenAt = new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString().slice(0, 19);
      many.set(`k${i}`, { latitude: 46 + i * 0.001, longitude: 7 + Math.sin(i / 3) * 0.01, takenAt });
    }
    const route = guestRoute(many.keys(), many);
    expect(route.length).toBeLessThanOrEqual(GUEST_ROUTE_MAX_POINTS);
    expect(route[0]).toEqual([46, 7]);
    expect(route[route.length - 1][0]).toBeCloseTo(46 + 5999 * 0.001, 9);
  });

  describe('guestTrackOf', () => {
    const sign = (path: string, w: number) => `signed:${w}:${path}`;
    const doc = {
      okey: 'trk__j__trip1', tenants: ['bka'], isArchived: false, journalKey: 'j', authorKey: 'p_bruno', tripKey: 'trip1',
      name: 'Uetliberg', startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T14:00:00Z', distanceM: 14123, durationS: 21600, modes: ['foot'],
      sections: [{ mode: 'foot', distanceM: 14123, encoded: '_p~iF~ps|U', altitudes: 'xyz', heartRateAvg: 120, steps: 1000 }],
      photos: [
        { imageKey: 't1', lat: 46.05, lng: 7.05, takenAt: '2026-11-01T09:20', assetId: 'A1' },
        { imageKey: 'gone', lat: 46.2, lng: 7.2, takenAt: '2026-11-01T11:00' }, // its image is archived
      ],
      // a doc from a faulty writer that carries more than the allow-list
      heartRateAvg: 120, heartRateMax: 160, steps: 12000, strokes: 900, strokeRateAvg: 22, crew: ['p_anna'], notes: 'privat', personKey: 'p_bruno',
    };

    it('Review Focus 1: the allow-listed copy without trip key, owner or any activity metric', () => {
      const track = guestTrackOf(doc, images, sign);
      expect(track).toEqual({
        name: 'Uetliberg', startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T14:00:00Z', distanceM: 14123, durationS: 21600, modes: ['foot'],
        sections: [{ mode: 'foot', distanceM: 14123, encoded: '_p~iF~ps|U', altitudes: 'xyz' }],
        photos: [{
          imageKey: 't1', lat: 46.05, lng: 7.05, takenAt: '2026-11-01T09:20',
          url: 'signed:1600:tenant/t/journal/j/2026-11-01T09:20-2048.jpg', thumb: 'signed:400:tenant/t/journal/j/2026-11-01T09:20-400.jpg',
        }],
      });
      expect(JSON.stringify(track)).not.toMatch(/heart|steps|stroke|crew|notes|personKey|p_bruno|trip1|assetId|authorKey|tenants/);
    });

    it('track photos are signed only for live images with a file', () => {
      const noFile = new Map<string, Record<string, unknown>>([['t1', { latitude: 1, longitude: 1 }]]);
      expect(guestTrackOf(doc, noFile, sign)?.photos).toEqual([]);
    });

    it('a photo without a 400 rendition gets an empty thumb, not a signed empty path', () => {
      const no400 = new Map<string, Record<string, unknown>>([['t1', { path2048: 'tenant/t/journal/j/a-2048.jpg' }]]);
      expect(guestTrackOf(doc, no400, sign)?.photos.map((p) => [p.url, p.thumb])).toEqual([['signed:1600:tenant/t/journal/j/a-2048.jpg', '']]);
      const blank400 = new Map<string, Record<string, unknown>>([['t1', { path2048: 'tenant/t/journal/j/a-2048.jpg', path400: '' }]]);
      expect(guestTrackOf(doc, blank400, sign)?.photos[0].thumb).toBe('');
    });

    it('a missing or archived track gives nothing', () => {
      expect(guestTrackOf(undefined, images, sign)).toBeUndefined();
      expect(guestTrackOf({ isArchived: true }, images, sign)).toBeUndefined();
    });
  });
});

describe('guestVideoClips', () => {
  it('skips a clip whose path is another journal, tenant or not a video file', () => {
    const other = new Map<string, Record<string, unknown>>([
      ['a', { videoPath: 'tenant/t/journal/other/a-video.mp4' }],
      ['b', { videoPath: 'tenant/x/journal/j/b-video.mp4' }],
      ['c', { videoPath: 'tenant/t/journal/j/c.pdf' }],
      ['d', { videoPath: 'tenant/t/journal/j/d-video.mp4' }],
    ]);
    expect(guestVideoClips(['a', 'b', 'c', 'd'], other, 't', 'j').map((c) => c.key)).toEqual(['d']);
  });
  const images = new Map<string, Record<string, unknown>>([
    ['a', { width: 1920, height: 1080, durationSec: 5, videoPath: 'tenant/t/journal/j/a-video.mp4', path2048: 'tenant/t/journal/j/a-2048.jpg' }],
    ['b', { width: 10, height: 10, path2048: 'tenant/t/journal/j/b-2048.jpg' }],
    ['c', { width: 640, height: 360, durationSec: 2, videoPath: 'tenant/t/journal/j/c-video.mp4' }],
  ]);
  it('keeps pick order and skips unknown images and photos without videoPath', () => {
    expect(guestVideoClips(['c', 'x', 'b', 'a'], images, 't', 'j')).toEqual([
      { key: 'c', width: 640, height: 360, durationSec: 2, objectPath: 'tenant/t/journal/j/c-video.mp4', posterPath: '' },
      { key: 'a', width: 1920, height: 1080, durationSec: 5, objectPath: 'tenant/t/journal/j/a-video.mp4', posterPath: 'tenant/t/journal/j/a-2048.jpg' },
    ]);
  });
});

describe('clipReadUrl', () => {
  const file = (exists: boolean) => {
    const signed: number[] = [];
    return {
      signed,
      exists: async (): Promise<[boolean]> => [exists],
      getSignedUrl: async (o: { expires: number }): Promise<[string]> => { signed.push(o.expires); return ['https://signed/clip']; },
    };
  };
  it('signs an uploaded clip', async () => {
    const f = file(true);
    expect(await clipReadUrl(f, 42)).toBe('https://signed/clip');
    expect(f.signed).toEqual([42]);
  });
  it('returns an empty url and signs nothing while the mp4 is not uploaded', async () => {
    const f = file(false);
    expect(await clipReadUrl(f, 42)).toBe('');
    expect(f.signed).toEqual([]);
  });
});

describe('parseGuestEmail', () => {
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      return String((error as { code?: unknown }).code);
    }
    return 'no error';
  };

  it('trims and lower-cases the email', () => {
    expect(parseGuestEmail({ personKey: 'anna', email: '  Anna.Muster@Example.CH ' })).toEqual({ personKey: 'anna', email: 'anna.muster@example.ch' });
  });

  it('drops extra fields', () => {
    expect(parseGuestEmail({ personKey: 'anna', email: 'anna@example.ch', tenants: ['other'], isFavorite: false }))
      .toEqual({ personKey: 'anna', email: 'anna@example.ch' });
  });

  it.each(['', '   ', 'anna', 'anna@', '@example.ch', 'anna@example', 'an na@example.ch', 42, undefined])('refuses the address %j', (email) => {
    expect(codeOf(() => parseGuestEmail({ personKey: 'anna', email }))).toBe('invalid-argument');
  });

  it('refuses an overlong address', () => {
    expect(codeOf(() => parseGuestEmail({ personKey: 'anna', email: `${'a'.repeat(250)}@example.ch` }))).toBe('invalid-argument');
  });

  it.each([undefined, '', 'a/b', 42])('refuses the person key %j', (personKey) => {
    expect(codeOf(() => parseGuestEmail({ personKey, email: 'anna@example.ch' }))).toBe('invalid-argument');
    expect(codeOf(() => parseGuestEmail(null))).toBe('invalid-argument');
  });
});

describe('peopleKeys', () => {
  it('takes the authors and every guest with a non-revoked link, authors first', () => {
    const links = [
      { personKey: 'anna', linkCode: CODE },
      { personKey: 'max', linkCode: CODE, revokedAt: '2026-11-01T00:00:00.000Z' },
      { personKey: 'eva', linkCode: CODE, expiresAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(peopleKeys(['bruno', 'lea'], links)).toEqual(['bruno', 'lea', 'anna', 'eva']);
  });

  it('removes duplicates: an author with a guest link, a guest with a revoked and a new link', () => {
    const links = [
      { personKey: 'bruno', linkCode: CODE },
      { personKey: 'anna', linkCode: CODE, revokedAt: '2026-11-01T00:00:00.000Z' },
      { personKey: 'anna', linkCode: CODE },
      { personKey: 'anna', linkCode: CODE },
    ];
    expect(peopleKeys(['bruno', 'bruno'], links)).toEqual(['bruno', 'anna']);
  });

  it('drops malformed keys and a missing authorKeys', () => {
    expect(peopleKeys(undefined, [{ personKey: 'anna', linkCode: CODE }])).toEqual(['anna']);
    expect(peopleKeys(['', 'a/b', 42, 'bruno'], [{ personKey: '', linkCode: CODE }])).toEqual(['bruno']);
  });
});

describe('guest comments and reactions on sections and images (1.154 phase 4)', () => {
  const base = { journalKey: 'j1', code: CODE };

  it('a comment with a parent: trimmed, the parent checked, the footprint not needed', () => {
    expect(parseGuestRequest({ ...base, action: 'comment', parentKey: 'section.s1', text: ' Toll ', footprintKey: 'f9' }))
      .toEqual({ ...base, action: 'comment', parentKey: 'section.s1', text: 'Toll' });
    expect(parseGuestRequest({ ...base, action: 'comment', parentKey: 'image.i1', text: 'x' })).toMatchObject({ parentKey: 'image.i1' });
    for (const parentKey of ['page.f1', 'section.', 'section.a/b', 'blog.x', 42, null]) {
      expect(() => parseGuestRequest({ ...base, action: 'comment', parentKey, text: 'x' })).toThrow(GuestRequestError);
    }
  });

  it('an old comment without a parent still needs its footprint (decision 10)', () => {
    expect(parseGuestRequest({ ...base, action: 'comment', footprintKey: 'f1', text: 'x' })).toEqual({ ...base, action: 'comment', footprintKey: 'f1', text: 'x' });
    expect(() => parseGuestRequest({ ...base, action: 'comment', text: 'x' })).toThrow(GuestRequestError);
    expect(parseGuestRequest({ ...base, action: 'like', footprintKey: 'f1' })).toEqual({ ...base, action: 'like', footprintKey: 'f1' });
  });

  it('react and unreact need a parent and exactly one emoji', () => {
    expect(parseGuestRequest({ ...base, action: 'react', parentKey: 'image.i1', emoji: '❤️', footprintKey: 'f9' }))
      .toEqual({ ...base, action: 'react', parentKey: 'image.i1', emoji: '❤️' });
    expect(parseGuestRequest({ ...base, action: 'unreact', parentKey: 'section.s1', emoji: '👨‍👩‍👧‍👦' })).toMatchObject({ action: 'unreact', emoji: '👨‍👩‍👧‍👦' });
    expect(() => parseGuestRequest({ ...base, action: 'react', emoji: '👍' })).toThrow(GuestRequestError);
    for (const emoji of ['', 'a', '1', '👍👍', '👍 ', '❤️x', '<b>', undefined, 42, '👍'.repeat(40)]) {
      expect(() => parseGuestRequest({ ...base, action: 'react', parentKey: 'section.s1', emoji })).toThrow(GuestRequestError);
    }
  });

  it('isOneEmoji: one grapheme that is an emoji', () => {
    for (const ok of ['👍', '❤️', '🇨🇭', '👍🏽', '1️⃣', '🏳️‍🌈']) expect(isOneEmoji(ok)).toBe(true);
    for (const bad of ['👍👎', '🇨🇭🇩🇪', 'x', ' ', '👍\u200b', '', 'ab']) expect(isOneEmoji(bad)).toBe(false);
  });

  const section = (key: string, type: GuestSection['type'], imageKeys: string[], feedback: Partial<GuestSection['feedback']> = {}): GuestSection => ({
    key, type, title: '', html: '', properties: {}, authorKey: 'bruno', imageKeys, clipKeys: [],
    feedback: { comments: true, reactions: true, imageComments: true, imageReactions: true, ...feedback },
  });

  describe('feedbackTarget (Review Focus 3)', () => {
    const published = new Map<string, GuestSection[]>([
      ['f1', [section('s1', 'article', ['i1', 'i2'], { imageReactions: false }), section('s2', 'album', ['i3'], { comments: false, reactions: false })]],
      ['f2', [section('s3', 'album', ['i2'])]],
    ]);

    it('a section or image of a published footprint gives its footprint', () => {
      expect(feedbackTarget('section.s1', 'reaction', published)).toBe('f1');
      expect(feedbackTarget('section.s1', 'comment', published)).toBe('f1');
      expect(feedbackTarget('image.i1', 'comment', published)).toBe('f1');
      expect(feedbackTarget('image.i3', 'reaction', published)).toBe('f1');
    });

    it('refuses a parent with its switch off', () => {
      expect(feedbackTarget('image.i1', 'reaction', published)).toBeUndefined();
      expect(feedbackTarget('section.s2', 'comment', published)).toBeUndefined();
      expect(feedbackTarget('section.s2', 'reaction', published)).toBeUndefined();
    });

    it('withdrawing (checkSwitch false) resolves a parent whose switch is off, but never an unpublished one', () => {
      expect(feedbackTarget('image.i1', 'reaction', published, false)).toBe('f1');
      expect(feedbackTarget('section.s2', 'reaction', published, false)).toBe('f1');
      expect(feedbackTarget('section.s9', 'reaction', published, false)).toBeUndefined();
      expect(feedbackTarget('section.s1', 'reaction', new Map(), false)).toBeUndefined();
    });

    it('refuses a parent outside the published footprints (a draft, another journal, unknown)', () => {
      expect(feedbackTarget('section.s9', 'comment', published)).toBeUndefined();
      expect(feedbackTarget('image.i9', 'reaction', published)).toBeUndefined();
      expect(feedbackTarget('page.f1', 'comment', published)).toBeUndefined();
      expect(feedbackTarget('section.s1', 'comment', new Map())).toBeUndefined();
    });

    it('an image in several sections is allowed when any containing section allows it', () => {
      // i2: image reactions off in s1 (f1), on in s3 (f2)
      expect(feedbackTarget('image.i2', 'reaction', published)).toBe('f2');
      expect(feedbackTarget('image.i2', 'comment', published)).toBe('f1');
    });

    it('a hero takes nothing, a video section no image feedback', () => {
      const hero = new Map([['f1', [{ ...section('h1', 'hero', ['i5']), feedback: { comments: false, reactions: false, imageComments: false, imageReactions: false } }]]]);
      expect(feedbackTarget('section.h1', 'comment', hero)).toBeUndefined();
      expect(feedbackTarget('image.i5', 'reaction', hero)).toBeUndefined();
    });
  });

  it('a guest deletes only their own live comment (Review Focus 4)', () => {
    expect(mayDeleteComment({ authorKey: 'anna', isArchived: false }, 'anna')).toBe(true);
    expect(mayDeleteComment({ authorKey: 'bruno', isArchived: false }, 'anna')).toBe(false);
    expect(mayDeleteComment({ authorKey: 'anna', isArchived: true }, 'anna')).toBe(false);
    expect(mayDeleteComment(undefined, 'anna')).toBe(false);
    expect(mayDeleteComment({ authorKey: '' }, '')).toBe(false);
  });

  describe('guestReactionWrite', () => {
    const parent = { kind: 'section' as const, id: 's1' };
    const key = reactionKey(parent, 'anna', '👍') as string;
    let seq = 0;
    const record = (op: JournalChange['op'], active: boolean, createdAt: string, authorKey = 'anna'): JournalChange => {
      seq += 1;
      const deviceId = `guest-${authorKey}`;
      return {
        id: `r${seq}`, journalKey: 'j1', deviceId, seq, hlc: formatHlc({ wall: 1000 + seq, counter: 0, deviceId }), authorKey,
        entity: 'reaction', entityKey: key, op, fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '👍', active, createdAt },
      };
    };

    it('the first reaction is a create', () => {
      expect(guestReactionWrite([], parent, 'f1', 'anna', '👍', true, 'T2')).toEqual({
        entityKey: key, op: 'create', fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '👍', active: true, createdAt: 'T2' },
      });
    });

    it('a known reaction is a set and keeps its first createdAt', () => {
      expect(guestReactionWrite([record('create', true, 'T1')], parent, 'f1', 'anna', '👍', false, 'T2'))
        .toEqual({ entityKey: key, op: 'set', fields: { parentKey: 'section.s1', footprintKey: 'f1', emoji: '👍', active: false, createdAt: 'T1' } });
    });

    it('removing a reaction that never existed writes nothing', () => {
      expect(guestReactionWrite([], parent, 'f1', 'anna', '👍', false, 'T2')).toBeUndefined();
      // another person's record on the key does not count as Anna's
      expect(guestReactionWrite([record('create', true, 'T1', 'mallory')], parent, 'f1', 'anna', '👍', false, 'T2')).toBeUndefined();
    });

    it('refuses an emoji that gives no key', () => {
      expect(guestReactionWrite([], parent, 'f1', 'anna', 'x', true, 'T2')).toBeUndefined();
    });
  });

  describe('guest summaries from the materialised docs', () => {
    const rk = (parentKey: string, personKey: string, emoji: string) => {
      const [kind, id] = parentKey.split('.') as ['section' | 'image', string];
      return reactionKey({ kind, id }, personKey, emoji) as string;
    };
    const reaction = (parentKey: string, personKey: string, emoji: string, createdAt: string, isArchived = false) =>
      ({ id: rk(parentKey, personKey, emoji), data: { parentKey, personKey, emoji, createdAt, isArchived } });
    const reactions = [
      reaction('section.s1', 'anna', '👍', 'T2'),
      reaction('section.s1', 'bruno', '👍', 'T3'),
      reaction('section.s1', 'bruno', '❤️', 'T1'),
      reaction('section.s1', 'carla', '😂', 'T4', true), // removed
      reaction('image.i1', 'bruno', '❤️', 'T5'),
      { id: 'f1_anna', data: { parentKey: 'page.f1', personKey: 'anna', type: 'like', createdAt: 'T0' } }, // old like
      { ...reaction('section.s1', 'mallory', '🔥', 'T6'), data: { parentKey: 'section.s1', personKey: 'mallory', emoji: '👎', createdAt: 'T6' } }, // key disagrees
    ];
    const comment = (id: string, parentKey: string, authorKey: string, createdAt: string, isArchived = false) =>
      ({ id, data: { parentKey, authorKey, authorName: `stored ${authorKey}`, description: `text ${id}`, creationDateTime: createdAt, isArchived } });
    const comments = [
      comment('c2', 'section.s1', 'bruno', 'T2'),
      comment('c1', 'section.s1', 'anna', 'T1'),
      comment('c3', 'section.s1', 'anna', 'T3', true),
      comment('c4', 'image.i1', 'zoe', 'T4'),
      comment('c0', 'page.f1', 'anna', 'T0'),
    ];
    const name = (personKey: string) => ({ anna: 'Anna Muster', bruno: 'Bruno Kaiser' } as Record<string, string>)[personKey] ?? '';
    const index = feedbackIndex(comments, reactions, 'anna', name);

    it('reaction summaries per parent: active only, mine for the guest, first use first, docs that disagree with their key left out', () => {
      expect(index.get('section.s1')?.reactions).toEqual([{ emoji: '❤️', count: 1, mine: false }, { emoji: '👍', count: 2, mine: true }]);
      expect(index.get('image.i1')?.reactions).toEqual([{ emoji: '❤️', count: 1, mine: false }]);
      expect(index.has('page.f1')).toBe(false);
    });

    it('comments per parent, oldest first, names from the journal lists, no person keys', () => {
      expect(index.get('section.s1')?.comments).toEqual([
        { key: 'c1', authorName: 'Anna Muster', text: 'text c1', createdAt: 'T1', mine: true },
        { key: 'c2', authorName: 'Bruno Kaiser', text: 'text c2', createdAt: 'T2', mine: false },
      ]);
      expect(index.get('image.i1')?.comments).toEqual([{ key: 'c4', authorName: 'stored zoe', text: 'text c4', createdAt: 'T4', mine: false }]);
      expect(JSON.stringify([...index.values()])).not.toMatch(/personKey|authorKey/);
    });

    it('a section gets its own and its images\' feedback, each only while its switch is on', () => {
      const s1 = section('s1', 'article', ['i1', 'i2']);
      expect(guestSectionFeedback({ ...s1, key: 's1' }, index)).toEqual({
        feedback: s1.feedback,
        reactions: index.get('section.s1')?.reactions, comments: index.get('section.s1')?.comments,
        images: { i1: { reactions: [{ emoji: '❤️', count: 1, mine: false }], comments: index.get('image.i1')?.comments }, i2: { reactions: [], comments: [] } },
      });
      const off = section('s1', 'article', ['i1'], { comments: false, imageReactions: false });
      const feedbackOff = guestSectionFeedback(off, index);
      expect(feedbackOff.comments).toEqual([]);
      expect(feedbackOff.reactions).toHaveLength(2);
      expect(feedbackOff.images).toEqual({ i1: { reactions: [], comments: index.get('image.i1')?.comments } });
      const allOff = guestSectionFeedback(section('s1', 'article', ['i1'], { comments: false, reactions: false, imageComments: false, imageReactions: false }), index);
      expect(allOff).toEqual({ feedback: { comments: false, reactions: false, imageComments: false, imageReactions: false }, reactions: [], comments: [], images: {} });
    });
  });
});
