import { describe, expect, it } from 'vitest';

import type { TrackSection, TransportMode, TripModel, TripTrack } from '@okr/shared-models';

import { toDiaryTrackCards } from './diary-track.util';

function section(mode: TransportMode, distanceM: number): TrackSection {
  return { mode, detected: true, startedAt: '', endedAt: '', distanceM, pointsPath: '' };
}

function trip(okey: string, startTime: string, track?: Partial<TripTrack>): TripModel {
  return {
    okey, name: `Trip ${okey}`, startTime, tenants: ['bka'], type: 'tracker',
    track: track ? { personKey: 'p1', ownerUid: 'u1', startedAt: '', endedAt: '', durationS: 0, sections: [], photos: [], ...track } : undefined,
  } as unknown as TripModel;
}

const P = (lat: number) => ({ lat, lng: 8, t: lat });

describe('toDiaryTrackCards', () => {
  it('returns [] for no trips', () => {
    expect(toDiaryTrackCards([], {})).toEqual([]);
  });

  it('maps one trip: sections with their points, distance, duration, photos', () => {
    const t = trip('a', '08:00', {
      durationS: 600,
      sections: [section('foot', 1200), section('train', 30000)],
      photos: [{ assetId: 'x', takenAt: '2026-10-26T08:05:00', lat: 47, lng: 8, ownGps: true, hidden: false, thumbPath: 'p/0.jpg' }],
    });
    const [card] = toDiaryTrackCards([t], { a: [[P(1), P(2)], [P(3)]] });
    expect(card.key).toBe('a');
    expect(card.name).toBe('Trip a');
    expect(card.startTime).toBe('08:00');
    expect(card.modes).toEqual(['foot', 'train']);
    expect(card.distanceM).toBe(31200);
    expect(card.durationS).toBe(600);
    expect(card.sections).toEqual([{ mode: 'foot', points: [P(1), P(2)] }, { mode: 'train', points: [P(3)] }]);
    expect(card.photos).toEqual([{ lat: 47, lng: 8, thumbPath: 'p/0.jpg', hidden: false, takenAt: '2026-10-26T08:05:00' }]);
  });

  it('sorts several trips by start time', () => {
    const cards = toDiaryTrackCards([trip('late', '17:30', {}), trip('early', '07:15', {}), trip('noon', '12:00', {})], {});
    expect(cards.map(c => c.key)).toEqual(['early', 'noon', 'late']);
  });

  it('collapses consecutive duplicate modes, keeps a mode that returns later', () => {
    const t = trip('a', '08:00', { sections: [section('foot', 1), section('foot', 1), section('train', 1), section('foot', 1)] });
    expect(toDiaryTrackCards([t], {})[0].modes).toEqual(['foot', 'train', 'foot']);
  });

  it('coalesces missing photos and points to []', () => {
    const t = trip('a', '08:00', { sections: [section('bike', 5)] });
    delete (t.track as Partial<TripTrack>).photos;
    const [card] = toDiaryTrackCards([t], {});
    expect(card.photos).toEqual([]);
    expect(card.sections).toEqual([{ mode: 'bike', points: [] }]);
  });

  it('skips trips without a track', () => {
    expect(toDiaryTrackCards([trip('legacy', '08:00')], {})).toEqual([]);
  });
});

describe('toDiaryTrackCards figures (spec 1.122)', () => {
  it('sums foot steps, takes the split of the longest row section and keeps each section figure', () => {
    const t = trip('f', '09:00', {
      sections: [
        { ...section('foot', 1000), steps: 6240 },
        { ...section('foot', 200), steps: 1000 },
        { ...section('row', 300), splitAvgS: 160, splitBestS: 150 },
        { ...section('row', 5000), splitAvgS: 148, splitBestS: 131 },
      ],
    });
    const [card] = toDiaryTrackCards([t], {});
    expect(card.steps).toBe(7240);
    expect(card.splitAvgS).toBe(148);
    expect(card.sections[0].steps).toBe(6240);
    expect(card.sections[3]).toEqual({ mode: 'row', points: [], splitAvgS: 148, splitBestS: 131 });
  });

  it('has no figure keys for a legacy trip', () => {
    const [card] = toDiaryTrackCards([trip('l', '09:00', { sections: [section('foot', 1000), section('row', 2000)] })], {});
    expect('steps' in card).toBe(false);
    expect('splitAvgS' in card).toBe(false);
    expect(card.sections).toEqual([{ mode: 'foot', points: [] }, { mode: 'row', points: [] }]);
  });
});

describe('toDiaryTrackCards stroke figures (spec 1.122 2c)', () => {
  it('sums the strokes of row sections and takes the stroke rate of the longest one', () => {
    const t = trip('s', '07:00', {
      sections: [
        { ...section('row', 2000), strokes: 200, strokeRateAvg: 26, strokeRateMax: 30 },
        { ...section('row', 6000), strokes: 600, strokeRateAvg: 22.4, strokeRateMax: 28 },
      ],
    });
    const [card] = toDiaryTrackCards([t], {});
    expect(card.strokes).toBe(800);
    expect(card.strokeRateAvg).toBe(22.4);
    expect(card.sections[1]).toMatchObject({ strokes: 600, strokeRateAvg: 22.4, strokeRateMax: 28 });
  });
  it('has no stroke keys for a legacy row trip', () => {
    const [card] = toDiaryTrackCards([trip('l', '07:00', { sections: [section('row', 2000)] })], {});
    expect('strokes' in card).toBe(false);
    expect('strokes' in card.sections[0]).toBe(false);
  });
});
