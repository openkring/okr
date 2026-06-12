import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPersisted, writePersisted } from './persisted-signal';

// Tests target the pure storage helpers that back persistedSignal(). The signal +
// effect glue (debounce, visibilitychange flush) is a thin Angular wrapper; the
// substantive persistence semantics — round-trip, TTL, corruption tolerance — live
// in these helpers and are testable without an Angular test environment.
describe('persisted-signal storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('round-trip', () => {
    it('writePersisted then readPersisted returns the stored value', () => {
      writePersisted('k:round', 'hello');
      expect(readPersisted('k:round', 'init', 10_000)).toBe('hello');
    });

    it('round-trips structured values', () => {
      const value = { topMessageId: '$abc', offsetPx: 42 };
      writePersisted('k:obj', value);
      expect(readPersisted('k:obj', null as typeof value | null, 10_000)).toEqual(value);
    });
  });

  describe('missing / corrupted entries', () => {
    it('returns initialValue when the key is absent', () => {
      expect(readPersisted('k:absent', 'fallback', 10_000)).toBe('fallback');
    });

    it('returns initialValue when the stored entry is not valid JSON', () => {
      localStorage.setItem('k:corrupt', '{ not json');
      expect(readPersisted('k:corrupt', 'fallback', 10_000)).toBe('fallback');
    });
  });

  describe('ttl', () => {
    it('restores a non-expired entry within ttl', () => {
      localStorage.setItem('k:fresh', JSON.stringify({ v: 'kept', t: Date.now() }));
      expect(readPersisted('k:fresh', 'fallback', 10_000)).toBe('kept');
    });

    it('returns initialValue when the entry is older than ttl', () => {
      vi.useFakeTimers();
      writePersisted('k:stale', 'old');          // stamped at "now"
      vi.advanceTimersByTime(1_000);             // 1 s later
      expect(readPersisted('k:stale', 'fresh', 500)).toBe('fresh'); // ttl 500 ms → expired
    });

    it('still restores just before the ttl boundary', () => {
      vi.useFakeTimers();
      writePersisted('k:edge', 'kept');
      vi.advanceTimersByTime(400);
      expect(readPersisted('k:edge', 'fresh', 500)).toBe('kept');   // 400 ms < 500 ms ttl
    });
  });
});
