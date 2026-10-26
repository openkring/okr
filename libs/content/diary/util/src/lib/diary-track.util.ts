import type { TrackSection, TransportMode, TripModel } from '@okr/shared-models';
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
  sections: { mode: TransportMode; points: TrackPoint[]; steps?: number; splitAvgS?: number; splitBestS?: number }[];
  /** spec 1.122: steps of all foot sections (absent when none has any) */
  steps?: number;
  /** spec 1.122: average split of the longest row section, s per 500 m */
  splitAvgS?: number;
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
    const card: DiaryTrackCard = {
      key: trip.okey,
      name: trip.name ?? '',
      startTime: trip.startTime ?? '',
      modes,
      distanceM: sections.reduce((m, s) => m + (s.distanceM ?? 0), 0),
      durationS: track.durationS ?? 0,
      sections: sections.map((s, i) => {
        const out: DiaryTrackCard['sections'][number] = { mode: s.mode, points: points[i] ?? [] };
        if (s.steps !== undefined) out.steps = s.steps;
        if (s.splitAvgS !== undefined) out.splitAvgS = s.splitAvgS;
        if (s.splitBestS !== undefined) out.splitBestS = s.splitBestS;
        return out;
      }),
      photos: (track.photos ?? []).map(p => {
        const photo: DiaryTrackCard['photos'][number] = { lat: p.lat, lng: p.lng, hidden: !!p.hidden, takenAt: p.takenAt };
        if (p.thumbPath) photo.thumbPath = p.thumbPath;
        return photo;
      }),
    };
    const foot = sections.filter(s => s.mode === 'foot' && s.steps !== undefined);
    if (foot.length > 0) card.steps = foot.reduce((n, s) => n + (s.steps ?? 0), 0);
    const longestRow = sections
      .filter(s => s.mode === 'row' && s.splitAvgS !== undefined)
      .reduce<TrackSection | undefined>((best, s) => (!best || (s.distanceM ?? 0) > (best.distanceM ?? 0) ? s : best), undefined);
    if (longestRow?.splitAvgS !== undefined) card.splitAvgS = longestRow.splitAvgS;
    cards.push(card);
  }
  return cards.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
