import { describe, expect, it } from 'vitest';

import { isCommentI18nKey, resolveLegacyCommentKey } from './legacy-comment-keys';

describe('resolveLegacyCommentKey', () => {
  it('should map the legacy initial-comment key onto the current scoped key', () => {
    expect(resolveLegacyCommentKey('@comment.operation.initial.conf')).toBe('@comment/ui.legacy.created');
  });

  it('should map the legacy update-comment key onto the current scoped key', () => {
    expect(resolveLegacyCommentKey('@comment.operation.update.conf')).toBe('@comment/ui.legacy.changed');
  });

  it('should map the legacy membership-created key written by the 2022 import', () => {
    expect(resolveLegacyCommentKey('@comment.message.membership.scsCreated')).toBe('@comment/ui.legacy.created');
  });

  it('should map every legacy delete-comment key onto the same scoped key', () => {
    for (const model of ['membership', 'ownership', 'personalRel', 'reservation', 'workingRel']) {
      expect(resolveLegacyCommentKey(`@comment.message.${model}.deleted`)).toBe('@comment/ui.legacy.deleted');
    }
  });

  it('should return a current scoped key unchanged', () => {
    expect(resolveLegacyCommentKey('@shared/data-access.comment.initial.conf')).toBe('@shared/data-access.comment.initial.conf');
  });

  it('should return plain text unchanged', () => {
    expect(resolveLegacyCommentKey('Danke für die Info')).toBe('Danke für die Info');
  });
});

describe('isCommentI18nKey', () => {
  it('should accept a current scoped key', () => {
    expect(isCommentI18nKey('@comment/ui.legacy.created')).toBe(true);
  });

  it('should accept a legacy unscoped key', () => {
    expect(isCommentI18nKey('@comment.operation.initial.conf')).toBe(true);
  });

  it('should accept a multi-segment scope path', () => {
    expect(isCommentI18nKey('@relationship/invitation/data-access.answer.accepted')).toBe(true);
  });

  it('should reject an @-mention with a colon and an umlaut (SCS-EZ)', () => {
    expect(isCommentI18nKey('@René:')).toBe(false);
  });

  it('should reject a bare @-mention without a dot', () => {
    expect(isCommentI18nKey('@Bruno')).toBe(false);
  });

  it('should reject text that does not start with @', () => {
    expect(isCommentI18nKey('comment.operation.initial.conf')).toBe(false);
  });

  it('should reject a lone @ and a trailing dot', () => {
    expect(isCommentI18nKey('@')).toBe(false);
    expect(isCommentI18nKey('@Peter.')).toBe(false);
  });
});
