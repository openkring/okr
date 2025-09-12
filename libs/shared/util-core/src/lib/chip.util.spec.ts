import { describe, expect, it } from 'vitest';
import { chipMatches, getNonSelectedChips } from './chip.util';

describe('chip.util', () => {
  describe('getNonSelectedChips', () => {
    it('should return all available chips when no chips are selected', () => {
      const availableChips = ['tag1', 'tag2', 'tag3'];
      const selectedChips: string[] = [];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array when all chips are selected', () => {
      const availableChips = ['tag1', 'tag2', 'tag3'];
      const selectedChips = ['tag1', 'tag2', 'tag3'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual([]);
    });

    it('should return only non-selected chips when some chips are selected', () => {
      const availableChips = ['tag1', 'tag2', 'tag3', 'tag4'];
      const selectedChips = ['tag2', 'tag4'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag1', 'tag3']);
    });

    it('should handle empty available chips array', () => {
      const availableChips: string[] = [];
      const selectedChips = ['tag1'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual([]);
    });

    it('should handle empty selected chips array', () => {
      const availableChips = ['tag1', 'tag2'];
      const selectedChips: string[] = [];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag1', 'tag2']);
    });

    it('should handle both arrays being empty', () => {
      const availableChips: string[] = [];
      const selectedChips: string[] = [];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual([]);
    });

    it('should handle case-sensitive chip names', () => {
      const availableChips = ['Tag1', 'tag2', 'TAG3'];
      const selectedChips = ['tag1', 'Tag2'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['TAG3']);
    });

    it('should handle chips with special characters', () => {
      const availableChips = ['tag-1', 'tag_2', 'tag.3', 'tag@4'];
      const selectedChips = ['tag-1', 'tag.3'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag_2', 'tag@4']);
    });

    it('should handle chips with spaces', () => {
      const availableChips = ['tag 1', 'tag 2', 'tag 3'];
      const selectedChips = ['tag 2'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag 1', 'tag 3']);
    });

    it('should handle duplicate chips in available chips', () => {
      const availableChips = ['tag1', 'tag2', 'tag1', 'tag3'];
      const selectedChips = ['tag1'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag2', 'tag3']);
    });

    it('should handle chips selected that are not in available chips', () => {
      const availableChips = ['tag1', 'tag2', 'tag3'];
      const selectedChips = ['tag4', 'tag5'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle translatable chips (starting with @)', () => {
      const availableChips = ['@common.save', '@common.cancel', 'regular-tag'];
      const selectedChips = ['@common.save'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['@common.cancel', 'regular-tag']);
    });

    it('should preserve order of available chips', () => {
      const availableChips = ['zebra', 'alpha', 'beta', 'gamma'];
      const selectedChips = ['beta'];

      const result = getNonSelectedChips(availableChips, selectedChips);

      expect(result).toEqual(['zebra', 'alpha', 'gamma']);
    });
  });

  describe('chipMatches', () => {
    it('should return true when selectedChip is undefined', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = undefined;

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return true when selectedChip is null', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = null;

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return true when selectedChip is empty string', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = '';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return false when storedChips is empty and selectedChip has value', () => {
      const storedChips = '';
      const selectedChip = 'tag1';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(false);
    });

    it('should return false when storedChips is null and selectedChip has value', () => {
      const storedChips = null as any;
      const selectedChip = 'tag1';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(false);
    });

    it('should return false when storedChips is undefined and selectedChip has value', () => {
      const storedChips = undefined as any;
      const selectedChip = 'tag1';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(false);
    });

    it('should return true when selectedChip matches stored chip exactly', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = 'tag2';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return true for case-insensitive matches', () => {
      const storedChips = 'Tag1,TAG2,tag3';
      const selectedChip = 'tag2';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return true for case-insensitive matches with different casing', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = 'TAG2';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should return false when selectedChip is not in storedChips', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = 'tag4';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(false);
    });

    it('should handle partial matches within chip names', () => {
      const storedChips = 'category,important,urgent';
      const selectedChip = 'cat';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle chips with spaces', () => {
      const storedChips = 'high priority,low priority,medium priority';
      const selectedChip = 'high priority';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle chips with special characters', () => {
      const storedChips = 'tag-1,tag_2,tag.3';
      const selectedChip = 'tag-1';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle single stored chip without comma', () => {
      const storedChips = 'onlyTag';
      const selectedChip = 'onlyTag';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle single stored chip that does not match', () => {
      const storedChips = 'onlyTag';
      const selectedChip = 'differentTag';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(false);
    });

    it('should handle translatable chips (starting with @)', () => {
      const storedChips = '@common.save,@common.cancel,regular-tag';
      const selectedChip = '@common.save';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle chips with numbers', () => {
      const storedChips = 'tag1,tag2,tag3';
      const selectedChip = '1';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle empty spaces in storedChips', () => {
      const storedChips = 'tag1, tag2 , tag3';
      const selectedChip = 'tag2';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle substring matches', () => {
      const storedChips = 'javascript,typescript,coffeescript';
      const selectedChip = 'script';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });

    it('should handle mixed case substring matches', () => {
      const storedChips = 'JavaScript,TypeScript,CoffeeScript';
      const selectedChip = 'script';

      const result = chipMatches(storedChips, selectedChip);

      expect(result).toBe(true);
    });
  });
});