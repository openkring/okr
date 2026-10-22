/** One rendered radar image: a transparent PNG in Web Mercator over `WeatherRadarModel.bounds`. */
export interface WeatherRadarFrame {
  time: number;             // measurement time (end of the 5-minute interval), unix seconds
  path: string;             // Storage path, e.g. 'weather/radar/meteoswiss/202610221100.png'
}

/** Geographic extent of every frame, WGS84 degrees. An object, not [[s,w],[n,e]]: Firestore rejects nested arrays. */
export interface WeatherRadarBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * The rolling frame list of the MeteoSwiss precipitation radar (spec 1.110), one shared document
 * for all tenants (`weather-radar/meteoswiss`).
 *
 * Written only by the scheduled Cloud Function `fetchMeteoSwissRadar`; the `rain_radar` widget
 * listens to it. The list holds the last 6 h; older PNGs stay in Storage as the archive.
 */
export interface WeatherRadarModel {
  okey: string;             // 'meteoswiss'
  tenants: string[];        // ['system'] — shared by every tenant
  source: string;           // 'meteoswiss'
  frames: WeatherRadarFrame[]; // oldest first
  bounds: WeatherRadarBounds;
  updatedAt: string;        // ISO timestamp of the last successful run
}

export const WeatherRadarCollection = 'weather-radar';
export const WeatherRadarModelName = 'weatherRadar';
export const METEOSWISS_RADAR_KEY = 'meteoswiss';
