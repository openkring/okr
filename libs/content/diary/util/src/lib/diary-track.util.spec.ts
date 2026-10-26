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
