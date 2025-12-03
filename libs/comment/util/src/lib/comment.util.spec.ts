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
      const parentKey = 'posts.post456';
      const tenant = 'tenant1';

      const comment = createComment(authorKey, authorName, commentStr, parentKey, tenant);

      expect(comment).toBeInstanceOf(CommentModel);
      expect(comment.bkey).toBe('');
      expect(comment.authorKey).toBe(authorKey);
      expect(comment.authorName).toBe(authorName);
      expect(comment.creationDateTime).toBe('20240117');
      expect(comment.parentKey).toBe(parentKey);
      expect(comment.description).toBe(commentStr);
      expect(comment.isArchived).toBe(false);
      expect(comment.tenants).toEqual([tenant]);
      expect(comment.index).toBe(getCommentIndex(comment));
    });

    it('should set tenants as array with single tenant', () => {
      const comment = createComment('k', 'n', 'c', 'pk', 'tnt');
      expect(comment.tenants).toEqual(['tnt']);
    });

    it('should call getTodayStr with DateFormat.StoreDate', () => {
      createComment('a', 'b', 'c', 'd', 'e');
      expect(getTodayStr).toHaveBeenCalledWith(DateFormat.StoreDate);
    });
  });

  describe('getCommentIndex', () => {
    it('should return correct index string', () => {
      const comment = new CommentModel();
      comment.authorName = 'Bob';
      comment.creationDateTime = '20240117';
      comment.parentKey = 'articles.art789';
      const index = getCommentIndex(comment);
      expect(index).toBe('an:Bob, cd:20240117, pk:articles.art789');
    });

    it('should handle empty fields', () => {
      const comment = new CommentModel();
      comment.authorName = '';
      comment.creationDateTime = '';
      comment.parentKey = '';
      const index = getCommentIndex(comment);
      expect(index).toBe('an:, cd:, pk:');
    });
  });
});