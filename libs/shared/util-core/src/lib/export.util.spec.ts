import { describe, expect, it } from 'vitest';

import { MoneyModel } from '@okr/shared-models';

import {
  buildExportTable,
  ExportColumn,
  formatExportBoolean,
  formatExportDate,
  formatExportList,
  formatExportTime,
  getPriceAmount,
  getPriceCurrency,
} from './export.util';

type Item = { name: string; count: number };

describe('export.util', () => {
  describe('buildExportTable', () => {
    const columns: ExportColumn<Item>[] = [
      { header: 'Name', value: (i) => i.name },
      { header: 'Anzahl', value: (i) => String(i.count) },
    ];

    it('should return the header row only for an empty item list', () => {
      expect(buildExportTable([], columns)).toEqual([['Name', 'Anzahl']]);
    });

    it('should return the header row plus one row per item', () => {
      const items: Item[] = [{ name: 'Boot A', count: 2 }, { name: 'Boot B', count: 1 }];
      expect(buildExportTable(items, columns)).toEqual([
        ['Name', 'Anzahl'],
        ['Boot A', '2'],
        ['Boot B', '1'],
      ]);
    });

    it('should return an empty row per item when there are no columns', () => {
      expect(buildExportTable([{ name: 'x', count: 0 }], [])).toEqual([[], []]);
    });
  });

  describe('formatExportDate', () => {
    it('should convert a StoreDate to a ViewDate', () => {
      expect(formatExportDate('20240512')).toBe('12.05.2024');
    });

    it('should return an empty string for the open-end marker', () => {
      expect(formatExportDate('99991231')).toBe('');
    });

    it('should return an empty string for an undefined or empty date', () => {
      expect(formatExportDate(undefined)).toBe('');
      expect(formatExportDate('')).toBe('');
    });

    it('should return an empty string for an unparseable date instead of throwing', () => {
      expect(formatExportDate('not-a-date')).toBe('');
    });
  });

  describe('formatExportTime', () => {
    it('should insert a colon into a 4-digit store time', () => {
      expect(formatExportTime('0930')).toBe('09:30');
      expect(formatExportTime('1815')).toBe('18:15');
    });

    it('should pass an already formatted time through', () => {
      expect(formatExportTime('07:45')).toBe('07:45');
    });

    it('should return an empty string for an empty or unsupported value', () => {
      expect(formatExportTime(undefined)).toBe('');
      expect(formatExportTime('')).toBe('');
      expect(formatExportTime('20240512103000')).toBe('');
    });
  });

  describe('getPriceAmount', () => {
    it('should return the amount of a MoneyModel', () => {
      expect(getPriceAmount(new MoneyModel(20000, 'CHF'))).toBe('20000');
    });

    it('should return zero amounts instead of an empty cell', () => {
      expect(getPriceAmount(new MoneyModel(0, 'CHF'))).toBe('0');
    });

    it('should tolerate the legacy numeric price shape', () => {
      expect(getPriceAmount(50)).toBe('50');
    });

    it('should return an empty string when there is no price', () => {
      expect(getPriceAmount(undefined)).toBe('');
    });
  });

  describe('getPriceCurrency', () => {
    it('should return the currency of a MoneyModel', () => {
      expect(getPriceCurrency(new MoneyModel(100, 'EUR'))).toBe('EUR');
    });

    it('should fall back to the sibling currency for a legacy numeric price', () => {
      expect(getPriceCurrency(50, 'CHF')).toBe('CHF');
    });

    it('should return the fallback when there is no price at all', () => {
      expect(getPriceCurrency(undefined, 'CHF')).toBe('CHF');
      expect(getPriceCurrency(undefined)).toBe('');
    });
  });

  describe('formatExportList', () => {
    it('should join an array with commas', () => {
      expect(formatExportList(['a', 'b'])).toBe('a, b');
    });

    it('should pass a string through', () => {
      expect(formatExportList('a, b')).toBe('a, b');
    });

    it('should return an empty string for an empty value', () => {
      expect(formatExportList(undefined)).toBe('');
      expect(formatExportList([])).toBe('');
    });
  });

  describe('formatExportBoolean', () => {
    it('should map true and false to the given labels', () => {
      expect(formatExportBoolean(true, 'ja', 'nein')).toBe('ja');
      expect(formatExportBoolean(false, 'ja', 'nein')).toBe('nein');
    });

    it('should treat undefined as false', () => {
      expect(formatExportBoolean(undefined, 'ja', 'nein')).toBe('nein');
    });
  });
});
