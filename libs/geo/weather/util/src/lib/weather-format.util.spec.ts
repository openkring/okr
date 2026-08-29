import { describe, expect, it } from 'vitest';
import {
  formatPrecipitation, formatPrecipitationRange, formatPrecipitationRate,
  formatSunshine, formatTemp, formatWind, windDirectionIndex
} from './weather-format.util';

describe('formatTemp', () => {
  it('rounds to whole degrees', () => {
    expect(formatTemp(27.4)).toBe('27°');
    expect(formatTemp(27.5)).toBe('28°');
    expect(formatTemp(0)).toBe('0°');
  });

  it('keeps the sign on sub-zero temperatures', () => {
    expect(formatTemp(-4.2)).toBe('-4°');
  });
});

describe('formatPrecipitation', () => {
  it('distinguishes no rain from a trace amount', () => {
    expect(formatPrecipitation(0)).toBe('0 mm');
    expect(formatPrecipitation(0.2)).toBe('< 1 mm');
    expect(formatPrecipitation(0.9)).toBe('< 1 mm');
  });

  it('rounds anything from 1 mm up', () => {
    expect(formatPrecipitation(1)).toBe('1 mm');
    expect(formatPrecipitation(13.6)).toBe('14 mm');
  });

  it('treats a negative value as no rain', () => {
    expect(formatPrecipitation(-0.1)).toBe('0 mm');
  });
});

describe('formatPrecipitationRange', () => {
  it('renders the provider bounds', () => {
    expect(formatPrecipitationRange(0, 0)).toBe('0 – 0 mm');
    expect(formatPrecipitationRange(3, 25)).toBe('3 – 25 mm');
  });

  it('clamps a negative lower bound to zero', () => {
    expect(formatPrecipitationRange(-2, 6)).toBe('0 – 6 mm');
  });
});

describe('formatPrecipitationRate', () => {
  it('mirrors formatPrecipitation with an hourly unit', () => {
    expect(formatPrecipitationRate(0)).toBe('0 mm/h');
    expect(formatPrecipitationRate(0.4)).toBe('< 1 mm/h');
    expect(formatPrecipitationRate(2.6)).toBe('3 mm/h');
  });
});

describe('formatWind', () => {
  it('keeps exactly one decimal', () => {
    expect(formatWind(6.7)).toBe('6.7 km/h');
    expect(formatWind(12)).toBe('12.0 km/h');
    expect(formatWind(6.74)).toBe('6.7 km/h');
    expect(formatWind(6.75)).toBe('6.8 km/h');
  });
});

describe('formatSunshine', () => {
  it('rounds to whole minutes', () => {
    expect(formatSunshine(50)).toBe('50 min/h');
    expect(formatSunshine(49.6)).toBe('50 min/h');
  });
});

describe('windDirectionIndex', () => {
  it('maps the eight compass points clockwise from north', () => {
    expect(windDirectionIndex(0)).toBe(0);    // N
    expect(windDirectionIndex(45)).toBe(1);   // NE
    expect(windDirectionIndex(90)).toBe(2);   // E
    expect(windDirectionIndex(180)).toBe(4);  // S
    expect(windDirectionIndex(225)).toBe(5);  // SW
    expect(windDirectionIndex(315)).toBe(7);  // NW
  });

  it('snaps to the nearest point', () => {
    expect(windDirectionIndex(20)).toBe(0);
    expect(windDirectionIndex(23)).toBe(1);
  });

  it('wraps around north rather than falling off the end', () => {
    // 350° is north, not a ninth direction — the classic off-by-one here
    expect(windDirectionIndex(350)).toBe(0);
    expect(windDirectionIndex(360)).toBe(0);
    expect(windDirectionIndex(720)).toBe(0);
  });

  it('handles a negative bearing', () => {
    expect(windDirectionIndex(-90)).toBe(6);  // W
  });
});
