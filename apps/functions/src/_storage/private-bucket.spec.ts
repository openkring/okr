import { describe, expect, it } from 'vitest';
import { privateBucketName } from './private-bucket';

describe('privateBucketName', () => {
  it('is the project id with a -private suffix', () => {
    expect(privateBucketName('bkaiser-org')).toBe('bkaiser-org-private');
  });
  it('refuses to guess without a project id — never falls back to the public default bucket', () => {
    expect(() => privateBucketName('')).toThrow(/project/);
  });
});
