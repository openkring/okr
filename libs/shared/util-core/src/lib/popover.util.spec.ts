import { describe, expect, it } from 'vitest';
import { contextMenuId } from './popover.util';

describe('popover.util', () => {
  describe('contextMenuId', () => {
    it('starts with the given prefix', () => {
      expect(contextMenuId('c_tasks')).toMatch(/^c_tasks_\d+$/);
    });

    it('never returns the same id twice, not even for the same prefix', () => {
      const ids = Array.from({ length: 50 }, () => contextMenuId('c_tasks'));
      expect(new Set(ids).size).toBe(50);
    });

    it('keeps ids of different prefixes apart', () => {
      expect(contextMenuId('c_docs')).not.toBe(contextMenuId('c_docs'));
      expect(contextMenuId('c_docs').startsWith('c_docs_')).toBe(true);
    });
  });
});
