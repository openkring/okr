import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeAgeByGenderStatistics, updateAgeByGenderStats, initializeCategoryByGenderStatistics, GenderRow } from './statistics.util';
import { GenderType } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

// Mock the getAge function from the core utilities
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    getAge: vi.fn(),
  };
});

describe('Statistics Utils', () => {
  describe('initializeAgeByGenderStatistics', () => {
    it('should return an array of 11 rows for age statistics', () => {
      const stats = initializeAgeByGenderStatistics();
      expect(stats).toHaveLength(11);
    });

    it('should initialize all values to 0', () => {
      const stats = initializeAgeByGenderStatistics();
      stats.forEach(row => {
        expect(row.m).toBe(0);
        expect(row.f).toBe(0);
        expect(row.d).toBe(0);
        expect(row.total).toBe(0);
      });
    });

    it('should have the correct row titles, including a "Total" row at the end', () => {
      const stats = initializeAgeByGenderStatistics();
      expect(stats[0].rowTitle).toBe('1-9');
      expect(stats[stats.length - 1].rowTitle).toBe('Total');
    });
  });

  describe('updateAgeByGenderStats', () => {
    let ageByGenderStats: GenderRow[];
    const mockGetAge = vi.mocked(coreUtils.getAge);

    beforeEach(() => {
      // Reset stats before each test
      ageByGenderStats = initializeAgeByGenderStatistics();
      // Reset mock before each test
      mockGetAge.mockClear();
    });

    it('should not update stats if dateOfBirth is undefined', () => {
      const initialStats = JSON.parse(JSON.stringify(ageByGenderStats));
      updateAgeByGenderStats(ageByGenderStats, GenderType.Male, undefined);
      expect(ageByGenderStats).toEqual(initialStats);
    });

    it('should not update stats if getAge returns -1', () => {
      mockGetAge.mockReturnValue(-1);
      const initialStats = JSON.parse(JSON.stringify(ageByGenderStats));
      updateAgeByGenderStats(ageByGenderStats, GenderType.Male, '2000-01-01');
      expect(ageByGenderStats).toEqual(initialStats);
    });

    it('should correctly update stats for a male', () => {
      // Corresponds to '20-29' age bracket
      mockGetAge.mockReturnValue(2);
      updateAgeByGenderStats(ageByGenderStats, GenderType.Male, '2000-01-01');

      // Check the specific age bracket
      expect(ageByGenderStats[2].m).toBe(1);
      expect(ageByGenderStats[2].f).toBe(0);
      expect(ageByGenderStats[2].d).toBe(0);
      expect(ageByGenderStats[2].total).toBe(1);

      // Check the total row
      const totalRow = ageByGenderStats[ageByGenderStats.length - 1];
      expect(totalRow.m).toBe(1);
      expect(totalRow.total).toBe(1);
    });

    it('should correctly update stats for a female', () => {
      // Corresponds to '30-39' age bracket
      mockGetAge.mockReturnValue(3);
      updateAgeByGenderStats(ageByGenderStats, GenderType.Female, '1990-01-01');

      // Check the specific age bracket
      expect(ageByGenderStats[3].f).toBe(1);
      expect(ageByGenderStats[3].m).toBe(0);
      expect(ageByGenderStats[3].total).toBe(1);

      // Check the total row
      const totalRow = ageByGenderStats[ageByGenderStats.length - 1];
      expect(totalRow.f).toBe(1);
      expect(totalRow.total).toBe(1);
    });

    it('should correctly update stats for "other" gender', () => {
      // Corresponds to '40-49' age bracket
      mockGetAge.mockReturnValue(4);
      updateAgeByGenderStats(ageByGenderStats, GenderType.Other, '1980-01-01');

      // Check the specific age bracket
      expect(ageByGenderStats[4].d).toBe(1);
      expect(ageByGenderStats[4].m).toBe(0);
      expect(ageByGenderStats[4].total).toBe(1);

      // Check the total row
      const totalRow = ageByGenderStats[ageByGenderStats.length - 1];
      expect(totalRow.d).toBe(1);
      expect(totalRow.total).toBe(1);
    });

    it('should not update stats for an unknown gender type', () => {
      mockGetAge.mockReturnValue(5);
      const initialStats = JSON.parse(JSON.stringify(ageByGenderStats));
      updateAgeByGenderStats(ageByGenderStats, 99, '1970-01-01');
      expect(ageByGenderStats).toEqual(initialStats);
    });
  });

  describe('initializeCategoryByGenderStatistics', () => {
    it('should return an array of 6 rows for category statistics', () => {
      const stats = initializeCategoryByGenderStatistics();
      expect(stats).toHaveLength(6);
    });

    it('should initialize all values to 0', () => {
      const stats = initializeCategoryByGenderStatistics();
      stats.forEach(row => {
        expect(row.m).toBe(0);
        expect(row.f).toBe(0);
        expect(row.d).toBe(0);
        expect(row.total).toBe(0);
      });
    });

    it('should have the correct row titles, including a "Total" row at the end', () => {
      const stats = initializeCategoryByGenderStatistics();
      const titles = stats.map(s => s.rowTitle);
      expect(titles).toEqual(['A', 'F', 'E', 'J', 'K', 'Total']);
    });
  });
});
