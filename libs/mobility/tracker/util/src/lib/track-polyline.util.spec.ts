import { describe, expect, it } from 'vitest';
import { decodeTrack, encodeTrack } from './track-polyline.util';
import type { TrackPoint } from './track-polyline.util';

describe('track polyline', () => {
  it('round-trips 3 points', () => {
    const pts: TrackPoint[] = [
      { lat: 47.36667, lng: 8.55, t: 1_760_000_000_000 },
      { lat: 47.36712, lng: 8.55123, t: 1_760_000_005_000 },
      { lat: 47.3601, lng: 8.5401, t: 1_760_000_065_000 },
    ];
    const out = decodeTrack(encodeTrack(pts));
    expect(out).toHaveLength(3);
    out.forEach((p, i) => {
      expect(Math.abs(p.lat - pts[i].lat)).toBeLessThan(1e-5);
      expect(Math.abs(p.lng - pts[i].lng)).toBeLessThan(1e-5);
      expect(p.t).toBe(pts[i].t);
    });
  });
  it('empty', () => {
    expect(encodeTrack([])).toBe('');
    expect(decodeTrack('')).toEqual([]);
  });
  it('handles negative coordinates', () => {
    const pts: TrackPoint[] = [
      { lat: -54.5, lng: -36.5, t: 1000_000 },
      { lat: -54.51, lng: -36.49, t: 1010_000 },
    ];
    const out = decodeTrack(encodeTrack(pts));
    expect(out[1].lat).toBeCloseTo(-54.51, 5);
    expect(out[1].lng).toBeCloseTo(-36.49, 5);
  });
  it('20000 points stay compact', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i < 20000; i++) pts.push({ lat: 47 + i * 0.00009, lng: 8 + i * 0.00003, t: 1_760_000_000_000 + i * 5000 });
    expect(encodeTrack(pts).length).toBeLessThan(300_000);
  });
});
