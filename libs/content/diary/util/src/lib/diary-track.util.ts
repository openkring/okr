import type { TransportMode, TripModel } from '@okr/shared-models';
import type { TrackPoint } from '@okr/mobility-tracker-util';

/** One recorded track of a diary day, ready for the card and the read-only track view (spec 1.121 §7). */
export interface DiaryTrackCard {
  key: string;
  name: string;
  startTime: string;
  /** transport modes in order, consecutive duplicates collapsed */
  modes: TransportMode[];
  distanceM: number;
  durationS: number;
  sections: { mode: TransportMode; points: TrackPoint[] }[];
  photos: { lat: number; lng: number; thumbPath?: string; hidden: boolean; takenAt: string }[];
}

/**
 * The tracker trips of one day as diary cards, sorted by start time. `pointsByTrip` holds the decoded points per
 * trip key and section index (missing = no points yet). Trips without `track` are skipped; a missing photo list
 * (legacy or freshly uploaded trips) counts as none.
 */
export function toDiaryTrackCards(trips: TripModel[], pointsByTrip: Record<string, TrackPoint[][]>): DiaryTrackCard[] {
  const cards: DiaryTrackCard[] = [];
  for (const trip of trips) {
    const track = trip.track;
    if (!track) continue;
    const sections = track.sections ?? [];
    const points = pointsByTrip[trip.okey] ?? [];
    const modes: TransportMode[] = [];
    for (const s of sections) if (modes[modes.length - 1] !== s.mode) modes.push(s.mode);
    cards.push({
      key: trip.okey,
      name: trip.name ?? '',
      startTime: trip.startTime ?? '',
      modes,
      distanceM: sections.reduce((m, s) => m + (s.distanceM ?? 0), 0),
      durationS: track.durationS ?? 0,
      sections: sections.map((s, i) => ({ mode: s.mode, points: points[i] ?? [] })),
      photos: (track.photos ?? []).map(p => {
        const photo: DiaryTrackCard['photos'][number] = { lat: p.lat, lng: p.lng, hidden: !!p.hidden, takenAt: p.takenAt };
        if (p.thumbPath) photo.thumbPath = p.thumbPath;
        return photo;
      }),
    });
  }
  return cards.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
