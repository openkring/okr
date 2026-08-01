// apps/functions/src/_gateway/cache.spec.ts
import { describe, it, expect } from 'vitest';
import { isExpired, prefixUpperBound } from './cache';

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

describe('prefixUpperBound', () => {
  // The exclusive upper bound of invalidateProvider's document-id range. Get this
  // wrong and invalidation either misses entries (stale data) or reaches past the
  // provider into a neighbouring one (deleting another provider's cache).
  const bound = (p: string) => prefixUpperBound(p);

  it('bumps the last character', () => {
    expect(bound('srv-members:t:scs:')).toBe('srv-members:t:scs;'); // ':' -> ';'
    expect(bound('oecd:')).toBe('oecd;');
  });

  it('brackets exactly the ids carrying the prefix', () => {
    const prefix = 'srv-members:t:scs:';
    const inRange = (id: string) => id >= prefix && id < bound(prefix);

    expect(inRange(prefix + '0000')).toBe(true);
    expect(inRange(prefix + 'ffff')).toBe(true);
    expect(inRange(prefix)).toBe(true);
  });

  it('excludes another tenant and another provider', () => {
    const prefix = 'srv-members:t:scs:';
    const inRange = (id: string) => id >= prefix && id < bound(prefix);

    expect(inRange('srv-members:t:p13:abcd')).toBe(false);
    expect(inRange('srv-member-detail:t:scs:abcd')).toBe(false);
    // A tenant id that merely EXTENDS ours must not be swept up with it.
    expect(inRange('srv-members:t:scs-test:abcd')).toBe(false);
  });

  it('returns empty for an empty prefix rather than throwing', () => {
    expect(bound('')).toBe('');
  });
});
