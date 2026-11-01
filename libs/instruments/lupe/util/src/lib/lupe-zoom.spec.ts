import { describe, expect, it } from 'vitest';

import { DIGITAL_ZOOM_RANGE } from './lupe.model';
import { clampZoom, formatZoom, hardwareZoomRange, hasTorch, nativeZoomRange, stepZoom, zoomRangeFor } from './lupe-zoom';

describe('hardwareZoomRange', () => {
  it('reads the range the camera reports', () => {
    expect(hardwareZoomRange({ zoom: { min: 1, max: 10, step: 0.1 } })).toEqual({ min: 1, max: 10, step: 0.1 });
  });

  it('defaults a missing step to 0.1', () => {
    expect(hardwareZoomRange({ zoom: { min: 1, max: 5 } })).toEqual({ min: 1, max: 5, step: 0.1 });
  });

  it('is undefined without zoom, with a fixed level or with nonsense', () => {
    expect(hardwareZoomRange(undefined)).toBeUndefined();
    expect(hardwareZoomRange({})).toBeUndefined();
    expect(hardwareZoomRange({ zoom: { min: 1, max: 1 } })).toBeUndefined();
    expect(hardwareZoomRange({ zoom: { min: 0, max: 4 } })).toBeUndefined();
    expect(hardwareZoomRange({ zoom: { min: 1, max: Number.NaN } })).toBeUndefined();
  });
});

describe('nativeZoomRange', () => {
  it('starts at 1x and caps the top', () => {
    expect(nativeZoomRange(0.5, 100)).toEqual({ min: 1, max: 15, step: 0.1 });
    expect(nativeZoomRange(1, 8)).toEqual({ min: 1, max: 8, step: 0.1 });
  });

  it('is undefined when nothing above 1x is left or the values are nonsense', () => {
    expect(nativeZoomRange(0.5, 1)).toBeUndefined();
    expect(nativeZoomRange(undefined, 10)).toBeUndefined();
    expect(nativeZoomRange(1, Number.NaN)).toBeUndefined();
  });
});

describe('zoomRangeFor', () => {
  it('falls back to digital zoom', () => {
    expect(zoomRangeFor({})).toBe(DIGITAL_ZOOM_RANGE);
  });
});

describe('hasTorch', () => {
  it('is true only when the camera says so', () => {
    expect(hasTorch({ torch: true })).toBe(true);
    expect(hasTorch({ torch: false })).toBe(false);
    expect(hasTorch(undefined)).toBe(false);
  });
});

describe('clampZoom', () => {
  const range = { min: 1, max: 8, step: 0.1 };

  it('clamps into the range', () => {
    expect(clampZoom(0.2, range)).toBe(1);
    expect(clampZoom(12, range)).toBe(8);
  });

  it('snaps to the step without float noise', () => {
    expect(clampZoom(1.23, range)).toBe(1.2);
    expect(clampZoom(1.1 + 0.1, range)).toBe(1.2);
  });

  it('maps a non-finite value to the minimum', () => {
    expect(clampZoom(Number.NaN, range)).toBe(1);
  });
});

describe('stepZoom', () => {
  it('moves a tenth of the range per press', () => {
    const range = { min: 1, max: 11, step: 0.1 };
    expect(stepZoom(1, range, 1)).toBe(2);
    expect(stepZoom(2, range, -1)).toBe(1);
  });

  it('stops at the ends', () => {
    expect(stepZoom(8, DIGITAL_ZOOM_RANGE, 1)).toBe(8);
    expect(stepZoom(1, DIGITAL_ZOOM_RANGE, -1)).toBe(1);
  });

  it('moves at least one step on a tiny range', () => {
    expect(stepZoom(1, { min: 1, max: 1.5, step: 0.5 }, 1)).toBe(1.5);
  });
});

describe('formatZoom', () => {
  it('shows at most one decimal', () => {
    expect(formatZoom(1)).toBe('1×');
    expect(formatZoom(2.54)).toBe('2.5×');
  });
});
