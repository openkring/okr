// apps/functions/src/_gateway/cache.spec.ts
import { describe, it, expect } from 'vitest';
import { isExpired } from './cache';

describe('isExpired', () => {
  const now = 1_000_000;
  it('is fresh before expiresAt', () => {
    expect(isExpired({ expiresAtMs: now + 1 }, now)).toBe(false);
  });
  it('is expired at/after expiresAt', () => {
    expect(isExpired({ expiresAtMs: now }, now)).toBe(true);
    expect(isExpired({ expiresAtMs: now - 1 }, now)).toBe(true);
  });
});
