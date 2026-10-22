import { WeatherRadarFrame, WeatherRadarModel } from '@okr/shared-models';

/** Where the `rain_radar` widget takes its pictures from. */
export type RadarSource = 'meteoswiss' | 'rainviewer';

/**
 * The newest MeteoSwiss frame may be at most this old. MeteoSwiss publishes about 4 minutes
 * after the measurement and the function runs every 5, so a healthy list is under ~10 minutes
 * behind; 30 minutes means several missed runs, and an hour-old "now" is worse than RainViewer.
 */
export const RADAR_MAX_AGE_SECONDS = 30 * 60;

/**
 * O2 (spec 1.110): MeteoSwiss inside its radar box, RainViewer everywhere else — switched, never
 * layered. A missing, short or stale frame list also falls back to RainViewer, so a stalled
 * pipeline degrades to the old picture instead of an empty map.
 */
export function pickRadarSource(
  radar: WeatherRadarModel | undefined,
  latitude: number,
  longitude: number,
  now: number,   // unix seconds
): RadarSource {
  const frames = radar?.frames ?? [];
  const b = radar?.bounds;
  if (!b || frames.length < 2) return 'rainviewer';
  const inside = latitude >= b.south && latitude <= b.north && longitude >= b.west && longitude <= b.east;
  const newest = frames[frames.length - 1].time;
  return inside && now - newest <= RADAR_MAX_AGE_SECONDS ? 'meteoswiss' : 'rainviewer';
}

/**
 * Where to stand after the frame list was replaced by a newer one (frames roll in and out every
 * 5 minutes). A viewer watching "now" follows to the new newest frame; anyone looking at an
 * earlier frame keeps it, at its new index; a frame that rolled out falls back to the oldest.
 */
export function nextRadarIndex(frames: WeatherRadarFrame[], shownTime: number | undefined, wasAtEnd: boolean): number {
  if (!frames.length) return 0;
  if (wasAtEnd || shownTime === undefined) return frames.length - 1;
  const index = frames.findIndex((f) => f.time === shownTime);
  return index >= 0 ? index : 0;
}
