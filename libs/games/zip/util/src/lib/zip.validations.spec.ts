import { describe, expect, it } from 'vitest';

import {
  ZIP_COUNTS,
  ZIP_DEFAULT_CONFIG,
  ZIP_SIZES,
  availableCounts,
  clampZipConfig,
  isValidZipConfig,
} from './zip.validations';

describe('the offered ranges', () => {
  it('offers sizes 3..6 and counts 4..10', () => {
    expect(ZIP_SIZES).toEqual([3, 4, 5, 6]);
    expect(ZIP_COUNTS).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it('ships a default that is itself valid', () => {
    expect(isValidZipConfig(ZIP_DEFAULT_CONFIG)).toBe(true);
  });
});

describe('clampZipConfig', () => {
  it('leaves a config inside the range untouched', () => {
    expect(clampZipConfig({ size: 4, count: 7 })).toEqual({ size: 4, count: 7 });
  });

  it('pulls a size below or above the range back to the edge', () => {
    expect(clampZipConfig({ size: 1, count: 6 }).size).toBe(3);
    expect(clampZipConfig({ size: 12, count: 6 }).size).toBe(6);
  });

  it('pulls a count below or above the range back to the edge', () => {
    expect(clampZipConfig({ size: 5, count: 0 }).count).toBe(4);
    expect(clampZipConfig({ size: 5, count: 99 }).count).toBe(10);
  });

  it('never allows more checkpoints than the board has cells', () => {
    expect(clampZipConfig({ size: 3, count: 10 })).toEqual({ size: 3, count: 9 });
  });

  it('falls back to the lowest value for a non-finite input', () => {
    expect(clampZipConfig({ size: Number.NaN, count: Number.NaN })).toEqual({ size: 3, count: 4 });
  });

  it('rounds a fractional input', () => {
    expect(clampZipConfig({ size: 4.6, count: 5.2 })).toEqual({ size: 5, count: 5 });
  });
});

describe('availableCounts', () => {
  it('drops the counts a 3x3 board cannot carry', () => {
    expect(availableCounts(3)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('offers every count on a board with room to spare', () => {
    expect(availableCounts(4)).toEqual(ZIP_COUNTS);
  });
});
