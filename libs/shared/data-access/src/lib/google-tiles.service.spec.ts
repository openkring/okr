import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';

import { GoogleTiles } from './google-tiles.service';

const store = new Map<string, string>();
const fetchMock = vi.fn();

function sessionResponse(token: string, expirySec: number): Response {
  return { ok: true, status: 200, json: async () => ({ session: token, expiry: String(expirySec) }) } as unknown as Response;
}

function make(key = 'K'): GoogleTiles {
  TestBed.configureTestingModule({ providers: [{ provide: ENV, useValue: { services: { gmapKey: key } } }] });
  return TestBed.inject(GoogleTiles);
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('GoogleTiles', () => {
  beforeEach(() => {
    store.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('session() caches and reuses until a day before expiry', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('A', nowSec() + 3 * 86400));
    const svc = make();
    expect(await svc.session('roadmap', 'de')).toBe('A');
    expect(await svc.session('roadmap', 'de')).toBe('A');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://tile.googleapis.com/v1/createSession?key=K');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mapType: 'roadmap', language: 'de-CH', region: 'CH' });
    expect(store.has('okr.gmaps.session.roadmap.de-CH')).toBe(true);

    store.set('okr.gmaps.session.roadmap.de-CH', JSON.stringify({ session: 'A', expiry: nowSec() + 3600 }));
    fetchMock.mockResolvedValueOnce(sessionResponse('B', nowSec() + 3 * 86400));
    expect(await svc.session('roadmap', 'de')).toBe('B');
  });

  it('session() resolves undefined on 403', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) } as unknown as Response);
    const svc = make();
    expect(await svc.session('satellite', 'fr')).toBeUndefined();
  });

  it('session() resolves undefined without a key and without a request', async () => {
    const svc = make('');
    expect(await svc.session('roadmap', 'de')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renew replaces the cached session', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('A', nowSec() + 3 * 86400));
    fetchMock.mockResolvedValueOnce(sessionResponse('B', nowSec() + 3 * 86400));
    const svc = make();
    expect(await svc.session('roadmap', 'de')).toBe('A');
    expect(await svc.renew('roadmap', 'de')).toBe('B');
    expect(await svc.session('roadmap', 'de')).toBe('B');
    expect(svc.cached('roadmap', 'de')).toBe('B');
  });

  it('renewal failure keeps the cached token', async () => {
    store.set('okr.gmaps.session.roadmap.de-CH', JSON.stringify({ session: 'A', expiry: nowSec() + 3 * 86400 }));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const svc = make();
    expect(await svc.renew('roadmap', 'de')).toBeUndefined();
    expect(svc.cached('roadmap', 'de')).toBe('A');
    expect(await svc.session('roadmap', 'de')).toBe('A');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a fetch that hangs times out', async () => {
    vi.useFakeTimers();
    // the runtime's AbortSignal.timeout runs on an internal timer the fake clock cannot advance: same contract on setTimeout
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    try {
      fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }));
      const svc = make();
      const session = svc.session('satellite', 'de');
      const probe = svc.probe('A');
      await vi.advanceTimersByTimeAsync(7999);
      expect(timeout).toHaveBeenCalledWith(8000);
      await vi.advanceTimersByTimeAsync(1);
      expect(await session).toBeUndefined();
      expect(await probe).toBe('failed');
      for (const call of fetchMock.mock.calls) expect(call[1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.useRealTimers();
    }
  });

  it('probe asks the viewport for the whole world at zoom 0', async () => {
    const svc = make();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ copyright: 'Google' }) } as unknown as Response);
    expect(await svc.probe('A')).toBe('ok');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://tile.googleapis.com/tile/v1/viewport?session=A&key=K&zoom=0&north=85&south=-85&east=180&west=-180',
    );
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as unknown as Response);
    expect(await svc.probe('A')).toBe('refused');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response);
    expect(await svc.probe('A')).toBe('failed');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await svc.probe('A')).toBe('failed');
  });
});
