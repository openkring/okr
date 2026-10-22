import { describe, expect, it } from 'vitest';
import { WeatherRadarModel } from '@okr/shared-models';
import { RADAR_MAX_AGE_SECONDS, nextRadarIndex, pickRadarSource } from './radar-source.util';

const NOW = 1_800_000_000;
const radar: WeatherRadarModel = {
  okey: 'meteoswiss', tenants: ['system'], source: 'meteoswiss', updatedAt: '',
  bounds: { south: 43.6, west: 2.7, north: 49.4, east: 12.5 },
  frames: [{ time: NOW - 600, path: 'a' }, { time: NOW - 300, path: 'b' }],
};

describe('pickRadarSource', () => {
  it('uses MeteoSwiss inside the box with a fresh list', () => {
    expect(pickRadarSource(radar, 47.24, 8.72, NOW)).toBe('meteoswiss');
  });

  it('switches to RainViewer outside the box', () => {
    expect(pickRadarSource(radar, 52.52, 13.4, NOW)).toBe('rainviewer');
  });

  it('falls back when the list is missing, too short or stale', () => {
    expect(pickRadarSource(undefined, 47.24, 8.72, NOW)).toBe('rainviewer');
    expect(pickRadarSource({ ...radar, frames: radar.frames.slice(1) }, 47.24, 8.72, NOW)).toBe('rainviewer');
    expect(pickRadarSource(radar, 47.24, 8.72, NOW + RADAR_MAX_AGE_SECONDS)).toBe('rainviewer');
  });
});

describe('nextRadarIndex', () => {
  const frames = [{ time: 2, path: '' }, { time: 3, path: '' }, { time: 4, path: '' }];

  it('follows "now" to the newest frame', () => {
    expect(nextRadarIndex(frames, 3, true)).toBe(2);
  });

  it('keeps an earlier frame at its new index', () => {
    expect(nextRadarIndex(frames, 3, false)).toBe(1);
  });

  it('falls back to the oldest when the shown frame rolled out', () => {
    expect(nextRadarIndex(frames, 1, false)).toBe(0);
  });
});
