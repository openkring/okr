import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStalledRestoreNote,
  dropExpiredSessionAfterStall,
  firebaseSessionKey,
  noteStalledExpiredRestore,
  STALLED_RESTORE_NOTE_KEY,
  STALLED_RESTORE_NOTE_TTL_MS,
  type NoteStorage,
} from './stalled-restore';

const API_KEY = 'test-key';
const NOW = 1_800_000_000_000;

function mapStorage(): NoteStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  };
}

const session = (expirationTime: number) => JSON.stringify({ uid: 'u1', stsTokenManager: { expirationTime } });

describe('dropExpiredSessionAfterStall', () => {
  let storage: ReturnType<typeof mapStorage>;
  beforeEach(() => { storage = mapStorage(); });

  it('drops an expired session after a noted stall and consumes the note', () => {
    storage.setItem(firebaseSessionKey(API_KEY), session(NOW - 1));
    noteStalledExpiredRestore(storage, NOW - 30_000);
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(true);
    expect(storage.map.has(firebaseSessionKey(API_KEY))).toBe(false);
    expect(storage.map.has(STALLED_RESTORE_NOTE_KEY)).toBe(false);
  });

  it('leaves the session alone without a note', () => {
    storage.setItem(firebaseSessionKey(API_KEY), session(NOW - 1));
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(false);
    expect(storage.map.has(firebaseSessionKey(API_KEY))).toBe(true);
  });

  it('leaves a still-valid session alone even after a noted stall', () => {
    storage.setItem(firebaseSessionKey(API_KEY), session(NOW + 60_000));
    noteStalledExpiredRestore(storage, NOW);
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(false);
    expect(storage.map.has(firebaseSessionKey(API_KEY))).toBe(true);
    expect(storage.map.has(STALLED_RESTORE_NOTE_KEY)).toBe(false);
  });

  it('ignores a note from an earlier visit', () => {
    storage.setItem(firebaseSessionKey(API_KEY), session(NOW - 1));
    noteStalledExpiredRestore(storage, NOW - STALLED_RESTORE_NOTE_TTL_MS - 1);
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(false);
    expect(storage.map.has(firebaseSessionKey(API_KEY))).toBe(true);
  });

  it('does nothing once the note was cleared by a restore that settled', () => {
    storage.setItem(firebaseSessionKey(API_KEY), session(NOW - 1));
    noteStalledExpiredRestore(storage, NOW);
    clearStalledRestoreNote(storage);
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(false);
  });

  it('never throws on an unreadable session blob or a throwing storage', () => {
    storage.setItem(firebaseSessionKey(API_KEY), '{not json');
    noteStalledExpiredRestore(storage, NOW);
    expect(dropExpiredSessionAfterStall(API_KEY, storage, NOW)).toBe(false);
    const throwing: NoteStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => noteStalledExpiredRestore(throwing, NOW)).not.toThrow();
    expect(dropExpiredSessionAfterStall(API_KEY, throwing, NOW)).toBe(false);
  });
});
