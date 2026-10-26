import type { TransportMode } from '@okr/shared-models';
import { formatKm, formatSteps, summarize, TRACK_MODE_COLOR, type TrackPoint } from '@okr/mobility-tracker-util';

import type { DiaryTrackCard } from './diary-track.util';

/** The mono totals line of the track view: distance, number of points, time range and visible photos. */
export interface DiaryTrackTotals {
  distance: string;
  points: number;
  /** «18:05–21:12»; one time for a single point; the trip's start time when there are no points */
  timeRange: string;
  photos: number;
}

/** One stretch tile of the track view: a section with its mode colour and its figures as display texts. */
export interface DiaryStretchTile {
  mode: TransportMode;
  color: string;
  icon: string;
  timeRange: string;
  distance: string;
  /** «12.3 km/h»; «–» without a duration */
  speed: string;
  /** spec 1.122: only for a section that has steps */
  steps?: string;
}

/**
 * Icon per transport mode (icon set `icons`). The set has no walker, skier or motorbike, so those three borrow the
 * closest shape.
 */
const TRACK_MODE_ICON: Record<TransportMode, string> = {
  foot: 'person',
  car: 'car',
  plane: 'airplane',
  ship: 'boat',
  bus: 'bus',
  train: 'train',
  bike: 'bicycle',
  row: 'rowing_1x_side',
  ski: 'person',
  motorbike: 'bicycle',
};

export function trackModeIcon(mode: TransportMode): string {
  return TRACK_MODE_ICON[mode] ?? 'location';
}

/** HH:mm in local wall-clock time of a point timestamp (ms). */
function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeRange(points: TrackPoint[]): string {
  if (points.length === 0) return '';
  const from = clock(points[0].t);
  const to = clock(points[points.length - 1].t);
  return points.length === 1 || from === to ? from : `${from}–${to}`;
}

/** below this a section's speed is GPS jitter, not movement */
const MIN_SPEED_DURATION_S = 5;

/** The Swiss regional locale of a UI language («fr» → «fr-CH»), as for the date. */
function trackLocale(lang: string): string {
  return `${lang}-CH`;
}

/** km/h with exactly one decimal in `locale`, «–» when the section lasts under 5 s. */
function speed(distanceM: number, durationS: number, locale: string): string {
  if (durationS < MIN_SPEED_DURATION_S) return '–';
  const kmh = (distanceM / durationS) * 3.6;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kmh)} km/h`;
}

/** The totals line of a track: the card's distance, all points, first to last point, visible photos; numbers in `lang`. */
export function trackTotals(card: DiaryTrackCard, lang = 'de'): DiaryTrackTotals {
  const points = card.sections.flatMap(s => s.points);
  return {
    distance: formatKm(card.distanceM, trackLocale(lang)),
    points: points.length,
    timeRange: timeRange(points) || card.startTime,
    photos: card.photos.filter(p => !p.hidden).length,
  };
}

/** One tile per section, in track order; distance and speed from the section's own points; numbers in `lang`. */
export function toStretchTiles(card: DiaryTrackCard, lang = 'de'): DiaryStretchTile[] {
  const locale = trackLocale(lang);
  return card.sections.map(s => {
    const { distanceM, durationS } = summarize(s.points);
    const tile: DiaryStretchTile = {
      mode: s.mode,
      color: TRACK_MODE_COLOR[s.mode],
      icon: trackModeIcon(s.mode),
      timeRange: timeRange(s.points),
      distance: formatKm(distanceM, locale),
      speed: speed(distanceM, durationS, locale),
    };
    if (s.steps !== undefined) tile.steps = formatSteps(s.steps, locale);
    return tile;
  });
}

/** `20261025` → «25. Oktober 2026» in `lang` (Swiss region); '' for a missing, partial or malformed date. */
export function formatTrackDate(storeDate: string, lang: string): string {
  if (!/^\d{8}$/.test(storeDate) || storeDate.endsWith('00') || storeDate.slice(4, 6) === '00') return '';
  const day = new Date(Date.UTC(+storeDate.slice(0, 4), +storeDate.slice(4, 6) - 1, +storeDate.slice(6, 8)));
  return new Intl.DateTimeFormat(trackLocale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(day);
}
