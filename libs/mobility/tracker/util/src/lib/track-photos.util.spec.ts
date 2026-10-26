import { describe, expect, it } from 'vitest';
import { LibraryPhoto, photoWindowEnd, withPhotoHidden, placePhotos, positionAt, trackThumbPath, trackTenants, localStoreDate } from './track-photos.util';
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
    const out = withPhotoHidden(photos, 1, true);
    expect(out).not.toBe(photos);
    expect(out.map((p) => p.hidden)).toEqual([false, true]);
    expect(photos[1].hidden).toBe(false);
  });
  it('shows a hidden photo again', () => expect(withPhotoHidden([ph('a', true)], 0, false)[0].hidden).toBe(false));
  it('returns the same array when nothing changes', () => {
    const photos = [ph('a', true)];
    expect(withPhotoHidden(photos, 0, true)).toBe(photos);
    expect(withPhotoHidden(photos, 3, false)).toBe(photos);
    expect(withPhotoHidden(photos, -1, false)).toBe(photos);
  });
});
