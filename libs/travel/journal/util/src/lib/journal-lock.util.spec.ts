import { describe, expect, it } from 'vitest';
import { JournalLock, lockedBy, mergeLocks } from './journal-lock.util';

const NOW = 1_800_000_000_000;
const lock = (entityKey: string, personKey: string, until: number): JournalLock => ({ journalKey: 'j1', entityKey, personKey, name: personKey, until });

describe('journal lock util', () => {
  it('lockedBy ignores my own lock', () => {
    expect(lockedBy({ f1: lock('f1', 'me', NOW + 1000) }, 'f1', 'me', NOW)).toBeUndefined();
  });

  it('lockedBy returns another person\'s live lock', () => {
    expect(lockedBy({ f1: lock('f1', 'anna', NOW + 1000) }, 'f1', 'me', NOW)?.personKey).toBe('anna');
  });

  it('expired lock is ignored', () => {
    expect(lockedBy({ f1: lock('f1', 'anna', NOW - 1) }, 'f1', 'me', NOW)).toBeUndefined();
  });

  it('mergeLocks keeps the later until', () => {
    const a = lock('f1', 'anna', NOW + 5000);
    const b = lock('f1', 'bea', NOW + 9000);
    expect(mergeLocks({ f1: a }, [b]).f1).toEqual(b);
    expect(mergeLocks({ f1: b }, [a]).f1).toEqual(b);
  });

  it('release (until 0) clears', () => {
    const merged = mergeLocks({ f1: lock('f1', 'anna', NOW + 5000) }, [lock('f1', 'anna', 0)]);
    expect(merged.f1).toBeUndefined();
  });

  it('does not mutate the current map', () => {
    const current = { f1: lock('f1', 'anna', NOW + 5000) };
    mergeLocks(current, [lock('f2', 'bea', NOW + 1)]);
    expect(Object.keys(current)).toEqual(['f1']);
  });
});
