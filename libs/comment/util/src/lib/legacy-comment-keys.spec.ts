import { describe, expect, it } from 'vitest';

import { resolveLegacyCommentKey } from './legacy-comment-keys';

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
