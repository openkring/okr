import { CommentModel } from '@bk2/shared-models';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';
import { describe, expect, it, vi } from 'vitest';
import { createComment, getCommentIndex } from './comment.util';

vi.mock('@bk2/shared-util-core', () => ({
  getTodayStr: vi.fn(() => '20240117'),
  DateFormat: { StoreDate: 'YYYYMMDD' }
}));

describe('comment.util', () => {
  describe('createComment', () => {
    it('should create a CommentModel with correct fields', () => {
      const authorKey = 'user123';
      const authorName = 'Alice';
      const commentStr = 'Hello world!';
      const parentCollection = 'posts';
      const parentKey = 'post456';
      const tenant = 'tenant1';

      const comment = createComment(authorKey, authorName, commentStr, parentCollection, parentKey, tenant);

      expect(comment).toBeInstanceOf(CommentModel);
      expect(comment.bkey).toBe('');
      expect(comment.authorKey).toBe(authorKey);
      expect(comment.authorName).toBe(authorName);
      expect(comment.creationDate).toBe('20240117');
      expect(comment.parentKey).toBe(parentKey);
      expect(comment.parentCollection).toBe(parentCollection);
      expect(comment.description).toBe(commentStr);
      expect(comment.isArchived).toBe(false);
      expect(comment.tenants).toEqual([tenant]);
      expect(comment.index).toBe(getCommentIndex(comment));
    });

    it('should set tenants as array with single tenant', () => {
      const comment = createComment('k', 'n', 'c', 'col', 'pk', 'tnt');
      expect(comment.tenants).toEqual(['tnt']);
    });

    it('should call getTodayStr with DateFormat.StoreDate', () => {
      createComment('a', 'b', 'c', 'd', 'e', 'f');
      expect(getTodayStr).toHaveBeenCalledWith(DateFormat.StoreDate);
    });
  });

  describe('getCommentIndex', () => {
    it('should return correct index string', () => {
      const comment = new CommentModel();
      comment.authorName = 'Bob';
      comment.creationDate = '20240117';
      comment.parentCollection = 'articles';
      comment.parentKey = 'art789';
      const index = getCommentIndex(comment);
      expect(index).toBe('an:Bob, cd:20240117, pc:articles pk:art789');
    });

    it('should handle empty fields', () => {
      const comment = new CommentModel();
      comment.authorName = '';
      comment.creationDate = '';
      comment.parentCollection = '';
      comment.parentKey = '';
      const index = getCommentIndex(comment);
      expect(index).toBe('an:, cd:, pc: pk:');
    });
  });
});