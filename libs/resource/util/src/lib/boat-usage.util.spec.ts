import { describe, expect, it } from 'vitest';
import { boatLabelKey, boatLabelRefIn, boatTargetKey, parseBoatLabelKey, getBoatSuffix, getMaxLoad, getUsageForYear, setUsageFromYear } from './boat-usage.util';

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

  it('never reaches to a neighbouring year — a missing season is missing', () => {
    expect(getUsageForYear('2025:ls2,2027:bs', 2026)).toBeUndefined();
    expect(getUsageForYear('2025:ls2,2027:bs', 2030)).toBeUndefined();
    expect(getUsageForYear('2025:ls2,2027:bs', 2020)).toBeUndefined();
  });

  it('reads an empty year entry as "in the table, unallocated"', () => {
    expect(getUsageForYear('2026:', 2026)).toBe('');
    expect(getUsageForYear('bs,2026:', 2026)).toBe('');
  });

  it('handles empty and malformed input', () => {
    expect(getUsageForYear('', 2026)).toBeUndefined();
    expect(getUsageForYear(undefined, 2026)).toBeUndefined();
    expect(getUsageForYear('  , ,2026:bs', 2026)).toBe('bs');
  });
});

describe('boatTargetKey', () => {
  it('joins year, usage and type', () => {
    expect(boatTargetKey(2026, 'bs', 'b4x')).toBe('2026|bs|b4x');
  });
});

describe('boatLabelKey / parseBoatLabelKey', () => {
  it('round-trips a boat-attached label', () => {
    const ref = { kind: 'boat', year: 2026, boatKey: 'JgzYXvpGYwdvXBqxp2c6' } as const;

    expect(boatLabelKey(ref)).toBe('2026|boat|JgzYXvpGYwdvXBqxp2c6');
    expect(parseBoatLabelKey(boatLabelKey(ref))).toEqual(ref);
  });

  it('round-trips a free-slot label', () => {
    const ref = { kind: 'slot', year: 2026, usage: 'bs', type: 'b4x', slot: 2 } as const;

    expect(boatLabelKey(ref)).toBe('2026|bs|b4x|2');
    expect(parseBoatLabelKey(boatLabelKey(ref))).toEqual(ref);
  });

  it('rejects a key of neither shape', () => {
    expect(parseBoatLabelKey('2026|bs|b4x')).toBeUndefined();
    expect(parseBoatLabelKey('nope|bs|b4x|1')).toBeUndefined();
    expect(parseBoatLabelKey('2026|bs|b4x|x')).toBeUndefined();
  });

  it('moves a ref to another season, keeping its identity', () => {
    const ref = { kind: 'slot', year: 2026, usage: 'bs', type: 'b4x', slot: 2 } as const;

    expect(boatLabelKey(boatLabelRefIn(ref, 2029))).toBe('2029|bs|b4x|2');
    expect(boatLabelKey(boatLabelRefIn({ kind: 'boat', year: 2026, boatKey: 'abc' }, 2029))).toBe('2029|boat|abc');
  });
});

describe('getMaxLoad', () => {
  it('takes the last number of a range', () => {
    expect(getMaxLoad('65 - 80')).toBe(80);
    expect(getMaxLoad('70-75 kg')).toBe(75);
    expect(getMaxLoad('72,5')).toBe(72.5);
  });

  it('returns undefined without a number', () => {
    expect(getMaxLoad('')).toBeUndefined();
    expect(getMaxLoad(undefined)).toBeUndefined();
    expect(getMaxLoad('leicht')).toBeUndefined();
  });
});

describe('getBoatSuffix', () => {
  it('marks light and heavy boats', () => {
    expect(getBoatSuffix('60 - 75', false)).toBe('l');
    expect(getBoatSuffix('75 - 85', false)).toBe('s');
    expect(getBoatSuffix('75 - 80', false)).toBe('');
  });

  it('marks private boats, combined with the weight suffix', () => {
    expect(getBoatSuffix('', true)).toBe('p');
    expect(getBoatSuffix('60 - 70', true)).toBe('lp');
  });
});

describe('setUsageFromYear', () => {
  it('applies the new value to the given year and the seasons that follow', () => {
    const changed = setUsageFromYear('bs', 2026, 'ls1');

    expect(getUsageForYear(changed, 2026)).toBe('ls1');
    expect(getUsageForYear(changed, 2027)).toBe('ls1');
    expect(getUsageForYear(changed, 2031)).toBe('ls1');
  });

  it('leaves the past alone — the bare default is never repointed', () => {
    const changed = setUsageFromYear('bs', 2026, 'ls1');

    expect(getUsageForYear(changed, 2025)).toBe('bs');
    expect(getUsageForYear(changed, 2021)).toBe('bs');
  });

  it('keeps explicit past entries and replaces the future ones', () => {
    const changed = setUsageFromYear('2024:cgig,2027:ls2', 2026, 'ls1');

    expect(getUsageForYear(changed, 2024)).toBe('cgig');
    expect(getUsageForYear(changed, 2025)).toBeUndefined();
    expect(getUsageForYear(changed, 2026)).toBe('ls1');
    expect(getUsageForYear(changed, 2027)).toBe('ls1');
  });

  it('writes an empty value as "in the table, unallocated"', () => {
    const changed = setUsageFromYear('2026:ls1', 2026, '');

    expect(getUsageForYear(changed, 2026)).toBe('');
    expect(getUsageForYear(changed, 2031)).toBe('');
  });

  it('starts from nothing', () => {
    expect(setUsageFromYear('', 2026, 'bs')).toBe('2026:bs,2027:bs,2028:bs,2029:bs,2030:bs,2031:bs');
  });
});
