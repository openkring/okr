/**
 * Bounding box of Switzerland in WGS84, used to place pins on the static map outline
 * of the `map` widget. Deliberately NOT a cartographic projection: the outline is a
 * hand-drawn SVG path, so a linear fit to the same box is both consistent with it and
 * enough for a label pin. Anything needing real accuracy uses Leaflet instead.
 */
export const SWISS_BOUNDS = { minLon: 5.96, maxLon: 10.49, minLat: 45.82, maxLat: 47.81 } as const;

/** viewBox of the outline in `weather-map.ts`. Keep the two in sync. */
export const SWISS_MAP_VIEWBOX = { width: 1000, height: 640 } as const;

/**
 * Projects WGS84 coordinates onto the map's viewBox. Values outside the box are clamped
 * to the edge, so a location just over the border still renders instead of flying off.
 */
export function projectToSwissMap(latitude: number, longitude: number): { x: number; y: number } {
  const { minLon, maxLon, minLat, maxLat } = SWISS_BOUNDS;
  const { width, height } = SWISS_MAP_VIEWBOX;
  const fx = (longitude - minLon) / (maxLon - minLon);
  const fy = (maxLat - latitude) / (maxLat - minLat);   // y grows southwards
  return {
    x: Math.round(Math.min(1, Math.max(0, fx)) * width * 10) / 10,
    y: Math.round(Math.min(1, Math.max(0, fy)) * height * 10) / 10,
  };
}
