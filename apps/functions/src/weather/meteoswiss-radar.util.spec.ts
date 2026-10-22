import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';

import {
  OdimWhere, buildRadarProjection, framePath, mergeFrames, paintRadarFrame, parseRadarFileName,
  selectNewFiles, stacItemId, stacItemIdsForWindow,
} from './meteoswiss-radar.util';

/** `/where` of a real PRECIP file (rzc262951100rl.001.h5, 2026-10-22 11:00 UTC). */
const WHERE: OdimWhere = {
  projdef: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  xsize: 710, ysize: 640, xscale: 1000, yscale: 1000,
  UL_lat: 49.3744010925293, UL_lon: 2.689419984817505,
  UR_lat: 49.36330032348633, UR_lon: 12.462300300598145,
  LL_lat: 43.62900161743164, LL_lon: 3.1687800884246826,
  LR_lat: 43.61899948120117, LR_lon: 11.955599784851074,
};

const T_1100 = Date.UTC(2026, 9, 22, 11, 0) / 1000;

describe('parseRadarFileName', () => {
  it('reads year, day of year and UTC time', () => {
    expect(parseRadarFileName('rzc262951100rl.001.h5')).toBe(T_1100);
  });

  it('rejects the other products', () => {
    expect(parseRadarFileName('tzc262951100rl.801.h5')).toBeUndefined();
    expect(parseRadarFileName('cpc262951100_00060.001.h5')).toBeUndefined();
  });
});

describe('stac item and frame names', () => {
  it('names the UTC day and minute', () => {
    expect(stacItemId(T_1100)).toBe('20261022-ch');
    expect(framePath(T_1100)).toBe('weather/radar/meteoswiss/202610221100.png');
  });

  it('reads yesterday as well while the window reaches past midnight', () => {
    expect(stacItemIdsForWindow(Date.UTC(2026, 9, 22, 3, 0) / 1000)).toEqual(['20261021-ch', '20261022-ch']);
    expect(stacItemIdsForWindow(T_1100)).toEqual(['20261022-ch']);
  });
});

describe('selectNewFiles', () => {
  const assets = {
    'rzc262951100rl.001.h5': { href: 'h/1100' },
    'rzc262951055rl.001.h5': { href: 'h/1055' },
    'rzc262950400rl.001.h5': { href: 'h/0400' },   // older than 6 h
    'tzc262951100rl.801.h5': { href: 'h/tzc' },
  };

  it('keeps unseen PRECIP files inside the window, oldest first', () => {
    const files = selectNewFiles(assets, new Set(), T_1100);
    expect(files.map((f) => f.href)).toEqual(['h/1055', 'h/1100']);
  });

  it('skips files that already are frames', () => {
    expect(selectNewFiles(assets, new Set([T_1100]), T_1100).map((f) => f.href)).toEqual(['h/1055']);
  });
});

describe('mergeFrames', () => {
  it('dedupes, sorts and trims to the window', () => {
    const old = { time: T_1100 - 7 * 3600, path: 'old' };
    const a = { time: T_1100 - 300, path: 'a' };
    const b = { time: T_1100, path: 'b' };
    expect(mergeFrames([old, b], [a, b], T_1100)).toEqual([a, b]);
  });
});

describe('buildRadarProjection', () => {
  const projection = buildRadarProjection(WHERE);

  it('covers the grid corners at about 1 km', () => {
    expect(projection.width).toBeGreaterThan(740);
    expect(projection.width).toBeLessThan(760);
    expect(projection.height).toBeGreaterThan(630);
    expect(projection.height).toBeLessThan(650);
    expect(projection.bounds.south).toBeCloseTo(43.619, 3);
    expect(projection.bounds.east).toBeCloseTo(12.462, 3);
  });

  it('puts Bern on its LV95 grid cell', () => {
    // Bern, Zytglogge: LV95 2600670 / 1199655 → column 345, row 280 of the source grid
    const lv95 = proj4(WHERE.projdef);
    const [lon, lat] = lv95.inverse([2600670, 1199655]);
    const [mx, my] = proj4('EPSG:3857').forward([lon, lat]);
    const [mx0] = proj4('EPSG:3857').forward([projection.bounds.west, projection.bounds.south]);
    const [, my1] = proj4('EPSG:3857').forward([projection.bounds.east, projection.bounds.north]);
    const res = (proj4('EPSG:3857').forward([projection.bounds.east, 0])[0] - mx0) / projection.width;
    const i = Math.floor((mx - mx0) / res);
    const j = Math.floor((my1 - my) / res);
    const src = projection.lut[j * projection.width + i];
    expect(Math.abs((src % WHERE.xsize) - 345)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.floor(src / WHERE.xsize) - 280)).toBeLessThanOrEqual(1);
  });

  it('leaves the corners of the box outside the rotated grid empty', () => {
    // the box's west edge is the grid's UL longitude; the LL corner lies half a degree further east
    expect(projection.lut[(projection.height - 1) * projection.width]).toBe(-1);
  });
});

describe('paintRadarFrame', () => {
  it('paints wet pixels opaque and leaves dry and missing ones transparent', () => {
    const projection = { width: 4, height: 1, bounds: { south: 0, west: 0, north: 1, east: 1 }, lut: Int32Array.from([0, 1, 2, -1]) };
    const { rgba, wet } = paintRadarFrame([0, Number.NaN, 5], projection);
    expect(wet).toBe(1);
    expect([...rgba.slice(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...rgba.slice(8, 12)]).toEqual([255, 238, 0, 255]);   // 5 mm/h → #ffee00
    expect([...rgba.slice(12, 16)]).toEqual([0, 0, 0, 0]);
  });
});
