import { describe, expect, it } from 'vitest';
import { isTransitMode, transitRouteKey, transitRouteReq } from './track-transit.util';

const points = [
  { lat: 46.7000049, lng: 8.79, t: Date.parse('2026-10-30T15:32:58Z') },
  { lat: 46.69, lng: 8.77, t: Date.parse('2026-10-30T15:35:00Z') },
  { lat: 46.68, lng: 8.75, t: Date.parse('2026-10-30T15:37:18Z') },
];

describe('transit sections', () => {
  it('knows the transit modes', () => {
    expect(isTransitMode('train')).toBe(true);
    expect(isTransitMode('ship')).toBe(true);
    expect(isTransitMode('foot')).toBe(false);
  });

  it('builds the request from the ends, rounded to 5 decimals', () => {
    expect(transitRouteReq({ mode: 'train', points })).toEqual({
      mode: 'train',
      from: { lat: 46.7, lng: 8.79 },
      to: { lat: 46.68, lng: 8.75 },
      startedAt: '2026-10-30T15:32:58.000Z',
      endedAt: '2026-10-30T15:37:18.000Z',
    });
    expect(transitRouteReq({ mode: 'foot', points })).toBeUndefined();
    expect(transitRouteReq({ mode: 'bus', points: points.slice(0, 1) })).toBeUndefined();
  });

  it('keys a section by mode and end times', () => {
    expect(transitRouteKey({ mode: 'train', points })).toBe(`train|${points[0].t}|${points[2].t}`);
    expect(transitRouteKey({ mode: 'bus', points })).not.toBe(transitRouteKey({ mode: 'train', points }));
    expect(transitRouteKey({ mode: 'train', points: [] })).toBe('');
  });
});
