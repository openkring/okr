import { describe, expect, it } from 'vitest';
import {
  LibraryPhoto, mergePhotos, nextThumbNumber, photoWindowEnd, serverPhotos, thumbNumber, wantsPhotoReattach, withoutPhoto, withPhotoHidden, placePhotos, positionAt, photosOnTrack,
  trackThumbPath, trackTenants, localStoreDate,
} from './track-photos.util';
import { TrackPoint } from './track-polyline.util';

const P = (t: number, lat: number, lng: number): TrackPoint => ({ t, lat, lng });
const photo = (assetId: string, takenAt: number, lat?: number, lng?: number): LibraryPhoto => ({
  assetId,
  takenAt,
  lat,
  lng,
  path400: `/tmp/${assetId}.jpg`,
});

describe('positionAt', () => {
  const pts = [P(1000, 10, 20), P(2000, 12, 24)];
  it('interpolates halfway', () => expect(positionAt(pts, 1500)).toEqual({ lat: 11, lng: 22 }));
  it('clamps before the first point', () => expect(positionAt(pts, 0)).toEqual({ lat: 10, lng: 20 }));
  it('clamps after the last point', () => expect(positionAt(pts, 9999)).toEqual({ lat: 12, lng: 24 }));
  it('returns undefined for no points', () => expect(positionAt([], 5)).toBeUndefined());
});

describe('placePhotos', () => {
  const sections = [[P(1000, 10, 20)], [P(2000, 12, 24)]];
  it('keeps own GPS, interpolates otherwise, filters and sorts', () => {
    const out = placePhotos(
      [photo('c', 5000), photo('b', 1500), photo('a', 1200, 1, 2), photo('d', 1100)],
      sections,
      1000,
      2000,
    );
    expect(out.map((p) => p.assetId)).toEqual(['d', 'a', 'b']);
    expect(out[1]).toMatchObject({ lat: 1, lng: 2, ownGps: true, hidden: false, path400: '/tmp/a.jpg' });
    expect(out[2]).toMatchObject({ lat: 11, lng: 22, ownGps: false, hidden: false });
    expect(out[0].takenAt).toBe(new Date(1100).toISOString());
  });
  it('drops photos that cannot be placed', () => {
    expect(placePhotos([photo('a', 1500)], [], 1000, 2000)).toEqual([]);
  });
});

describe('trackTenants', () => {
  it('adds matching targets after own, deduplicated', () => {
    const t = (tenantId: string, sources: ('tracker' | 'tripDone')[], to = '') => ({ tenantId, sources, from: '', to });
    expect(trackTenants('bkg', [t('bka', ['tracker'])], '20261026')).toEqual(['bkg', 'bka']);
    expect(trackTenants('bkg', [t('bka', ['tracker'], '20261001')], '20261026')).toEqual(['bkg']);
    expect(trackTenants('bkg', [t('bka', ['tripDone'])], '20261026')).toEqual(['bkg']);
    expect(trackTenants('bkg', [t('bkg', ['tracker']), t('bka', ['tracker']), t('bka', ['tracker'])], '20261026')).toEqual(['bkg', 'bka']);
    expect(trackTenants('bkg', undefined, '20261026')).toEqual(['bkg']);
  });
});

describe('trackThumbPath', () => {
  it('builds the private bucket path', () => expect(trackThumbPath('bkg', 'k1', 2)).toBe('tenant/bkg/tracks/k1/2.jpg'));
});

describe('localStoreDate', () => {
  it('formats the local day', () => expect(localStoreDate(new Date(2026, 9, 5, 23, 59).getTime())).toBe('20261005'));
});

describe('photoWindowEnd', () => {
  const MIN = 60_000;
  const lastFix = 1_000_000;
  const sections = [[P(10, 0, 0), P(lastFix, 0, 0)], [P(30, 0, 0)]];
  const endedAt = lastFix + 5 * 60 * MIN; // a resumed track that ended hours after its last fix
  it('ends 30 min after the last fix, not at the end of a long gap', () => expect(photoWindowEnd(sections, endedAt)).toBe(lastFix + 30 * MIN));
  it('includes a photo 20 min after the last fix', () => expect(lastFix + 20 * MIN <= photoWindowEnd(sections, endedAt)).toBe(true));
  it('excludes a photo 40 min after the last fix', () => expect(lastFix + 40 * MIN <= photoWindowEnd(sections, endedAt)).toBe(false));
  it('falls back to endedAt without points', () => expect(photoWindowEnd([[], []], 9999)).toBe(9999));
  it('never later than endedAt', () => expect(photoWindowEnd([[P(20000, 0, 0)]], 25000)).toBe(25000));
});

describe('withPhotoHidden', () => {
  const ph = (assetId: string, hidden: boolean) => ({ assetId, takenAt: '2026-10-26T10:00:00.000Z', lat: 1, lng: 2, ownGps: true, hidden });
  it('sets hidden on one photo in a new array', () => {
    const photos = [ph('a', false), ph('b', false)];
    const out = withPhotoHidden(photos, 'b', true);
    expect(out).not.toBe(photos);
    expect(out.map((p) => p.hidden)).toEqual([false, true]);
    expect(photos[1].hidden).toBe(false);
  });
  it('shows a hidden photo again', () => expect(withPhotoHidden([ph('a', true)], 'a', false)[0].hidden).toBe(false));
  it('returns the same array when nothing changes', () => {
    const photos = [ph('a', true)];
    expect(withPhotoHidden(photos, 'a', true)).toBe(photos);
    expect(withPhotoHidden(photos, 'zz', false)).toBe(photos);
  });
  it('finds the photo by assetId after a re-sort', () => {
    const photos = [ph('new', false), ph('a', false)]; // a merge put a new photo in front of 'a'
    expect(withPhotoHidden(photos, 'a', true).map((p) => p.hidden)).toEqual([false, true]);
  });
});

describe('withPhotoHidden thumbnails', () => {
  const ph = { assetId: 'a', takenAt: '2026-10-26T10:00:00.000Z', lat: 1, lng: 2, ownGps: true, hidden: false, thumbPath: 'tenant/t/tracks/k/0.jpg' };
  it('drops the thumbPath when hiding', () => expect(withPhotoHidden([ph], 'a', true)[0].thumbPath).toBeUndefined());
  it('keeps the thumbPath of the other photos', () => {
    const out = withPhotoHidden([ph, { ...ph, assetId: 'b' }], 'a', true);
    expect(out[1].thumbPath).toBe('tenant/t/tracks/k/0.jpg');
  });
});

describe('withoutPhoto', () => {
  it('removes one entry in a new array', () => expect(withoutPhoto(['a', 'b', 'c'], 1)).toEqual(['a', 'c']));
  it('returns the same array out of range', () => {
    const list = ['a'];
    expect(withoutPhoto(list, 1)).toBe(list);
    expect(withoutPhoto(list, -1)).toBe(list);
  });
});

describe('serverPhotos', () => {
  const base = { takenAt: '2026-10-26T10:00:00.000Z', lat: 1, lng: 2, ownGps: false };
  it('leaves hidden photos out and strips path400', () => {
    const out = serverPhotos([
      { ...base, assetId: 'a', hidden: false, path400: '/c/a.jpg', thumbPath: 'tenant/t/tracks/k/0.jpg' },
      { ...base, assetId: 'b', hidden: true, path400: '/c/b.jpg' },
    ]);
    expect(out).toEqual([{ ...base, assetId: 'a', hidden: false, thumbPath: 'tenant/t/tracks/k/0.jpg' }]);
  });
  it('writes no undefined keys', () => {
    const [p] = serverPhotos([{ ...base, assetId: 'a', hidden: false }]);
    expect(Object.keys(p)).not.toContain('thumbPath');
    expect(Object.keys(p)).not.toContain('imageKey');
  });
  it('is empty without photos', () => expect(serverPhotos(undefined)).toEqual([]));
});

describe('mergePhotos', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 9, 26, 10, min)).toISOString();
  const ph = (assetId: string, min: number, extra: Record<string, unknown> = {}) =>
    ({ assetId, takenAt: at(min), lat: 1, lng: 2, ownGps: true, hidden: false, path400: `/old/${assetId}.jpg`, ...extra });
  const found = (assetId: string, min: number) => ({ assetId, takenAt: at(min), lat: 3, lng: 4, ownGps: false, hidden: false, path400: `/new/${assetId}.jpg` });
  it('keeps hidden flag and thumbPath of a known photo, takes the fresh rendition', () => {
    const { photos, added } = mergePhotos([ph('a', 5, { hidden: true }), ph('b', 10, { thumbPath: 'tenant/t/tracks/k/1.jpg' })], [found('a', 5), found('b', 10)]);
    expect(added).toBe(0);
    expect(photos[0]).toMatchObject({ assetId: 'a', hidden: true, lat: 1, path400: '/new/a.jpg' });
    expect(photos[1]).toMatchObject({ assetId: 'b', thumbPath: 'tenant/t/tracks/k/1.jpg', path400: '/new/b.jpg' });
  });
  it('adds new photos in time order', () => {
    const { photos, added } = mergePhotos([ph('a', 5), ph('c', 20)], [found('b', 10), found('a', 5)]);
    expect(added).toBe(1);
    expect(photos.map((p) => p.assetId)).toEqual(['a', 'b', 'c']);
  });
  it('keeps a known photo the new search no longer returns', () => {
    const { photos } = mergePhotos([ph('a', 5)], []);
    expect(photos).toEqual([ph('a', 5)]);
  });
  it('takes all found photos when there were none', () => expect(mergePhotos(undefined, [found('a', 1)]).added).toBe(1));
});

describe('wantsPhotoReattach', () => {
  const done = { state: 'done' };
  it('searches a done track without photos', () => expect(wantsPhotoReattach(done, 'full')).toBe(true));
  it('searches a done track with an empty list', () => expect(wantsPhotoReattach({ ...done, photos: [] }, 'limited')).toBe(true));
  it('searches again after a limited search', () => expect(wantsPhotoReattach({ ...done, photos: [1], photosAccess: 'limited' }, 'full')).toBe(true));
  it('does not search again after a full search', () => expect(wantsPhotoReattach({ ...done, photos: [1], photosAccess: 'full' }, 'full')).toBe(false));
  it('does not search without access', () => {
    expect(wantsPhotoReattach(done, 'denied')).toBe(false);
    expect(wantsPhotoReattach(done, undefined)).toBe(false);
  });
  it('does not search a recording track', () => expect(wantsPhotoReattach({ state: 'recording' }, 'full')).toBe(false));
});

describe('thumbnail numbers', () => {
  it('parses the number of a thumb path', () => {
    expect(thumbNumber('tenant/t/tracks/k/12.jpg')).toBe(12);
    expect(thumbNumber(undefined)).toBeUndefined();
    expect(thumbNumber('tenant/t/tracks/k/a.jpg')).toBeUndefined();
  });
  it('is above every referenced number, the photo count and the sequence', () => {
    expect(nextThumbNumber([{ thumbPath: 'x/7.jpg' }, {}], undefined)).toBe(8);
    expect(nextThumbNumber([{}, {}, {}], undefined)).toBe(3);
    expect(nextThumbNumber([{ thumbPath: 'x/1.jpg' }], 9)).toBe(9);
    expect(nextThumbNumber(undefined, undefined)).toBe(0);
  });
});

describe('photosOnTrack', () => {
  const track = [[P(0, 47, 8), P(100_000, 47.001, 8)]];
  const shot = (takenAt: number, lat: number, lng: number, ownGps: boolean) => ({
    assetId: 'a', takenAt: new Date(takenAt).toISOString(), lat, lng, ownGps, hidden: false,
  });

  it('keeps own GPS close to the track', () => {
    const photos = [shot(50_000, 47.0005, 8.001, true)]; // ~76 m off
    expect(photosOnTrack(photos, track)).toBe(photos);
  });

  it('moves own GPS far off the track onto it, as interpolated', () => {
    const [p] = photosOnTrack([shot(50_000, 47.0005, 8.01, true)], track); // ~760 m off
    expect(p.lat).toBeCloseTo(47.0005);
    expect(p.lng).toBeCloseTo(8);
    expect(p.ownGps).toBe(false);
  });

  it('re-interpolates a photo without own GPS, leaves photos outside the track time alone', () => {
    const [moved, outside] = photosOnTrack([shot(50_000, 47.2, 8.2, false), shot(200_000, 47.2, 8.2, true)], track);
    expect(moved.lat).toBeCloseTo(47.0005);
    expect(outside.lat).toBe(47.2);
  });
});
