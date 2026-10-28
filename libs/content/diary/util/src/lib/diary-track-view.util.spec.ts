import { describe, expect, it } from 'vitest';

import { formatSteps, TRACK_MODE_COLOR } from '@okr/mobility-tracker-util';

import type { DiaryTrackCard } from './diary-track.util';
import { formatTrackDate, toStretchTiles, trackModeIcon, trackTotals } from './diary-track-view.util';

/** local wall-clock ms on 25.10.2026 — independent of the test machine's time zone */
const at = (h: number, m: number) => new Date(2026, 9, 25, h, m).getTime();
/** ~111 m per 0.001° latitude */
const pt = (lat: number, h: number, m: number) => ({ lat, lng: 8.7, t: at(h, m) });

function card(over: Partial<DiaryTrackCard> = {}): DiaryTrackCard {
  return {
    key: 'k', name: 'DinnerSaskia', startDate: '20261025', startTime: '18:05', modes: ['foot', 'car'],
    distanceM: 4321, durationS: 3600,
    sections: [
      { mode: 'foot', points: [pt(47.000, 18, 5), pt(47.010, 18, 35)], steps: 2345 },
      { mode: 'car', points: [pt(47.010, 21, 0), pt(47.030, 21, 6), pt(47.040, 21, 12)] },
    ],
    photos: [
      { lat: 47, lng: 8.7, hidden: false, takenAt: '2026-10-25T18:10:00' },
      { lat: 47, lng: 8.7, hidden: true, takenAt: '2026-10-25T18:20:00' },
      { lat: 47, lng: 8.7, hidden: false, takenAt: '2026-10-25T21:05:00' },
    ],
    ...over,
  };
}

describe('trackTotals', () => {
  it('sums distance, counts points and visible photos, spans first to last point', () => {
    expect(trackTotals(card())).toEqual({ distance: '4.3 km', points: 5, timeRange: '18:05–21:12', photos: 2 });
  });

  it('formats the distance in the UI language', () => {
    expect(trackTotals(card(), 'fr').distance).toBe('4,3 km');
  });

  it('falls back to the start time when there are no points', () => {
    const c = card({ sections: [{ mode: 'foot', points: [] }], photos: [] });
    expect(trackTotals(c)).toEqual({ distance: '4.3 km', points: 0, timeRange: '18:05', photos: 0 });
  });

  it('shows a single point as one time', () => {
    const c = card({ sections: [{ mode: 'foot', points: [pt(47, 9, 3)] }] });
    expect(trackTotals(c).timeRange).toBe('09:03');
  });
});

describe('toStretchTiles', () => {
  it('builds one tile per section with mode colour, icon, time, distance and speed', () => {
    const [foot, car] = toStretchTiles(card());
    expect(foot).toMatchObject({ mode: 'foot', color: TRACK_MODE_COLOR.foot, icon: trackModeIcon('foot'), timeRange: '18:05–18:35', steps: formatSteps(2345) });
    expect(foot.distance).toBe('1.1 km');
    expect(foot.speed).toBe('2.2 km/h'); // 1.11 km in 30 min
    expect(car).toMatchObject({ mode: 'car', timeRange: '21:00–21:12', distance: '3.3 km', speed: '16.7 km/h' });
    expect(car.steps).toBeUndefined();
  });

  it('shows a dash for the speed when the section has no duration', () => {
    const [tile] = toStretchTiles(card({ sections: [{ mode: 'plane', points: [pt(47, 9, 0)] }] }));
    expect(tile).toMatchObject({ timeRange: '09:00', distance: '0.0 km', speed: '–' });
  });

  it('shows a dash for a section under 5 s (GPS jitter)', () => {
    const t = at(9, 0);
    const points = [{ lat: 47, lng: 8.7, t }, { lat: 47.001, lng: 8.7, t: t + 4000 }];
    expect(toStretchTiles(card({ sections: [{ mode: 'foot', points }] }))[0].speed).toBe('–');
    const five = [{ lat: 47, lng: 8.7, t }, { lat: 47.001, lng: 8.7, t: t + 5000 }];
    expect(toStretchTiles(card({ sections: [{ mode: 'foot', points: five }] }))[0].speed).not.toBe('–');
  });

  it('formats distance, speed and steps in the UI language', () => {
    const [foot, car] = toStretchTiles(card(), 'fr');
    expect(foot).toMatchObject({ distance: '1,1 km', speed: '2,2 km/h', steps: formatSteps(2345, 'fr-CH') });
    expect(car.speed).toBe('16,7 km/h');
  });

  it('keeps a section without points (no time, dash for the speed)', () => {
    const [tile] = toStretchTiles(card({ sections: [{ mode: 'ship', points: [] }] }));
    expect(tile).toMatchObject({ mode: 'ship', timeRange: '', speed: '–' });
  });

  it('keeps one decimal for a round speed', () => {
    // 0.1° latitude ≈ 11.12 km in exactly one hour
    const [tile] = toStretchTiles(card({ sections: [{ mode: 'ship', points: [pt(47, 10, 0), pt(47.1, 11, 0)] }] }));
    expect(tile.speed).toBe('11.1 km/h');
  });

  it('returns [] for a track without sections', () => {
    expect(toStretchTiles(card({ sections: [] }))).toEqual([]);
  });
});

describe('formatTrackDate', () => {
  it('formats a StoreDate with the weekday and month name', () => {
    expect(formatTrackDate('20261025', 'de')).toBe('Sonntag, 25. Oktober 2026');
    expect(formatTrackDate('20261025', 'en')).toBe('Sunday, 25 October 2026');
  });

  it('returns empty for a missing or malformed date', () => {
    expect(formatTrackDate('', 'de')).toBe('');
    expect(formatTrackDate('2026-10-25', 'de')).toBe('');
    expect(formatTrackDate('20261000', 'de')).toBe('');
  });
});

describe('trackModeIcon', () => {
  it('maps every mode to an icon name', () => {
    expect(trackModeIcon('plane')).toBe('airplane');
    expect(trackModeIcon('ship')).toBe('boat');
    expect(trackModeIcon('bike')).toBe('bicycle');
  });
});
