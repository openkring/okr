import { describe, expect, it } from 'vitest';

import { Dec } from './calculator-decimal';
import { convertUnit, findCategory, UNIT_CATEGORIES } from './calculator-units';

describe('convertUnit', () => {
  it('converts length', () => {
    expect(convertUnit('length', 'km', 'mi', new Dec(5)).toSignificantDigits(9).toString()).toBe('3.10685596');
    expect(convertUnit('length', 'ft', 'in', new Dec(1)).toString()).toBe('12');
  });

  it('converts temperature with an offset', () => {
    expect(convertUnit('temperature', 'C', 'F', new Dec(100)).toString()).toBe('212');
    expect(convertUnit('temperature', 'F', 'C', new Dec(32)).isZero()).toBe(true);
    expect(convertUnit('temperature', 'C', 'K', new Dec(0)).toString()).toBe('273.15');
  });

  it('converts data and speed', () => {
    expect(convertUnit('data', 'GiB', 'MiB', new Dec(1)).toString()).toBe('1024');
    expect(convertUnit('data', 'bit', 'B', new Dec(1)).toString()).toBe('0.125');
    expect(convertUnit('speed', 'kmh', 'mps', new Dec(1)).toSignificantDigits(16).toString()).toBe('0.2777777777777778');
    expect(convertUnit('speed', 'kmh', 'mps', new Dec(36)).toSignificantDigits(16).toString()).toBe('10');
  });

  it('round-trips every unit of every category', () => {
    for (const category of UNIT_CATEGORIES) {
      const base = category.units[0].id;
      for (const unit of category.units) {
        const there = convertUnit(category.id, unit.id, base, new Dec(7));
        const back = convertUnit(category.id, base, unit.id, there);
        expect(back.toSignificantDigits(16).toString(), `${category.id}.${unit.id}`).toBe('7');
      }
    }
  });

  it('rejects an unknown unit', () => {
    expect(() => convertUnit('length', 'parsec', 'm', new Dec(1))).toThrow();
  });
});

describe('unit categories', () => {
  it('has unique ids and valid defaults', () => {
    for (const category of UNIT_CATEGORIES) {
      const ids = category.units.map(u => u.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(category.defaultFrom);
      expect(ids).toContain(category.defaultTo);
    }
    expect(UNIT_CATEGORIES.map(c => c.id)).toEqual(['length', 'area', 'volume', 'mass', 'temperature', 'time', 'speed', 'data']);
  });

  it('finds a category, falling back to length', () => {
    expect(findCategory('mass').id).toBe('mass');
  });
});
