import { describe, expect, it } from 'vitest';
import { boatTargetKey, getUsageForYear, setUsageForYear } from './boat-usage.util';

describe('getUsageForYear', () => {
  it('returns a legacy plain value for every year', () => {
    expect(getUsageForYear('breitensport', 2026)).toBe('breitensport');
    expect(getUsageForYear('breitensport', 2019)).toBe('breitensport');
  });

  it('returns the exact year entry', () => {
    expect(getUsageForYear('2025:ls2,2026:bs,2027:bs', 2026)).toBe('bs');
    expect(getUsageForYear('2025:ls2,2026:bs,2027:bs', 2025)).toBe('ls2');
  });

  it('prefers the year entry over the bare default', () => {
    expect(getUsageForYear('bs,2026:ls1', 2026)).toBe('ls1');
    expect(getUsageForYear('bs,2026:ls1', 2030)).toBe('bs');
  });

  it('falls back to the nearest earlier, then the earliest year', () => {
    expect(getUsageForYear('2025:ls2,2027:bs', 2026)).toBe('ls2');
    expect(getUsageForYear('2025:ls2,2027:bs', 2030)).toBe('bs');
    expect(getUsageForYear('2025:ls2,2027:bs', 2020)).toBe('ls2');
  });

  it('handles empty and malformed input', () => {
    expect(getUsageForYear('', 2026)).toBe('');
    expect(getUsageForYear(undefined, 2026)).toBe('');
    expect(getUsageForYear('  , ,2026:bs', 2026)).toBe('bs');
  });
});

describe('setUsageForYear', () => {
  it('keeps the bare default and the other years', () => {
    expect(setUsageForYear('bs,2025:ls2', 2026, 'ls1')).toBe('bs,2025:ls2,2026:ls1');
  });

  it('turns a legacy plain value into a default plus one year', () => {
    expect(setUsageForYear('breitensport', 2026, 'bs')).toBe('breitensport,2026:bs');
    expect(getUsageForYear(setUsageForYear('breitensport', 2026, 'bs'), 2019)).toBe('breitensport');
  });

  it('overwrites an existing year and sorts by year', () => {
    expect(setUsageForYear('2027:bs,2025:ls2', 2025, 'ls1')).toBe('2025:ls1,2027:bs');
  });

  it('removes the year entry when the value is empty', () => {
    expect(setUsageForYear('bs,2026:ls1', 2026, '')).toBe('bs');
  });

  it('starts from nothing', () => {
    expect(setUsageForYear('', 2026, 'bs')).toBe('2026:bs');
  });
});

describe('boatTargetKey', () => {
  it('joins year, usage and type', () => {
    expect(boatTargetKey(2026, 'bs', 'b4x')).toBe('2026|bs|b4x');
  });
});
