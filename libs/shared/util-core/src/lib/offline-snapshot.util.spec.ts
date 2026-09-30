import { firstValueFrom, from, of, Subject, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearOfflineSnapshots,
  isBrowserOffline,
  isEmptySnapshotValue,
  readOfflineSnapshot,
  withOfflineSnapshot,
  writeOfflineSnapshot,
} from './offline-snapshot.util';

function setOnline(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

describe('offline-snapshot.util', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  describe('read/write/clear', () => {
    it('round-trips a value', () => {
      writeOfflineSnapshot('user.u1', { okey: 'u1', roles: { admin: true } });
      expect(readOfflineSnapshot('user.u1')).toEqual({ okey: 'u1', roles: { admin: true } });
    });

    it('returns undefined for a missing or corrupt entry', () => {
      expect(readOfflineSnapshot('nope')).toBeUndefined();
      localStorage.setItem('okr.offline.bad', '{not json');
      expect(readOfflineSnapshot('bad')).toBeUndefined();
    });

    it('clears only the given prefix', () => {
      writeOfflineSnapshot('user.u1', 1);
      writeOfflineSnapshot('user.u2', 2);
      writeOfflineSnapshot('appConfig.scs', 3);
      localStorage.setItem('unrelated', 'x');
      clearOfflineSnapshots('user.');
      expect(readOfflineSnapshot('user.u1')).toBeUndefined();
      expect(readOfflineSnapshot('user.u2')).toBeUndefined();
      expect(readOfflineSnapshot('appConfig.scs')).toBe(3);
      expect(localStorage.getItem('unrelated')).toBe('x');
    });
  });

  it('isEmptySnapshotValue treats undefined, null and [] as empty', () => {
    expect(isEmptySnapshotValue(undefined)).toBe(true);
    expect(isEmptySnapshotValue(null)).toBe(true);
    expect(isEmptySnapshotValue([])).toBe(true);
    expect(isEmptySnapshotValue([1])).toBe(false);
    expect(isEmptySnapshotValue({})).toBe(false);
    expect(isEmptySnapshotValue(0)).toBe(false);
  });

  it('isBrowserOffline follows navigator.onLine', () => {
    setOnline(false);
    expect(isBrowserOffline()).toBe(true);
    setOnline(true);
    expect(isBrowserOffline()).toBe(false);
  });

  describe('withOfflineSnapshot', () => {
    it('online: passes values through unchanged and persists the non-empty ones', async () => {
      setOnline(true);
      writeOfflineSnapshot('k', 'old');
      const out = await firstValueFrom(from<(string | undefined)[]>([undefined, 'new']).pipe(withOfflineSnapshot('k'), toArray()));
      expect(out).toEqual([undefined, 'new']);
      expect(readOfflineSnapshot('k')).toBe('new');
    });

    it('online: an empty value never overwrites the snapshot', async () => {
      setOnline(true);
      writeOfflineSnapshot('k', ['a']);
      await firstValueFrom(from<string[][]>([[]]).pipe(withOfflineSnapshot('k'), toArray()));
      expect(readOfflineSnapshot('k')).toEqual(['a']);
    });

    it('offline with a snapshot: emits the snapshot first and suppresses empty live values', async () => {
      setOnline(false);
      writeOfflineSnapshot('k', ['cached']);
      const out = await firstValueFrom(from<string[][]>([[], ['live']]).pipe(withOfflineSnapshot('k'), toArray()));
      expect(out).toEqual([['cached'], ['live']]);
    });

    it('offline without a snapshot: behaves like the live stream', async () => {
      setOnline(false);
      const out = await firstValueFrom(from<(string | undefined)[]>([undefined]).pipe(withOfflineSnapshot('k'), toArray()));
      expect(out).toEqual([undefined]);
    });

    it('lets an empty value through once the browser is back online', () => {
      setOnline(false);
      writeOfflineSnapshot('k', 'cached');
      const live = new Subject<string | undefined>();
      const seen: (string | undefined)[] = [];
      live.pipe(withOfflineSnapshot('k')).subscribe(v => seen.push(v));
      live.next(undefined);          // offline: suppressed
      setOnline(true);
      live.next(undefined);          // online: the server says it is gone
      expect(seen).toEqual(['cached', undefined]);
    });

    it('supports a custom emptiness test', async () => {
      setOnline(false);
      writeOfflineSnapshot('k', 5);
      const out = await firstValueFrom(of(0, 7).pipe(withOfflineSnapshot<number>('k', v => v === 0), toArray()));
      expect(out).toEqual([5, 7]);
    });
  });
});
