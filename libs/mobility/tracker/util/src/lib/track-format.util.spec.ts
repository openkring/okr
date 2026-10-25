import { describe, expect, it } from 'vitest';
import { formatDuration, formatKm } from './track-format.util';

describe('formatDuration', () => {
  it('formats h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(65)).toBe('0:01:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(36000)).toBe('10:00:00');
  });
  it('floors fractions and clamps negatives', () => {
    expect(formatDuration(59.9)).toBe('0:00:59');
    expect(formatDuration(-5)).toBe('0:00:00');
  });
});

describe('formatKm', () => {
  it('formats kilometres with one decimal', () => {
    expect(formatKm(0)).toBe('0.0 km');
    expect(formatKm(1234)).toBe('1.2 km');
    expect(formatKm(12_960)).toBe('13.0 km');
  });
  it('uses the de-CH decimal separator', () => {
    expect(formatKm(1234, 'de-CH')).toBe('1.2 km');
  });
});
