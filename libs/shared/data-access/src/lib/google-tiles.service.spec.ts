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

  it('invalidate forces a new session', async () => {
    fetchMock.mockResolvedValueOnce(sessionResponse('A', nowSec() + 3 * 86400));
    fetchMock.mockResolvedValueOnce(sessionResponse('B', nowSec() + 3 * 86400));
    const svc = make();
    expect(await svc.session('roadmap', 'de')).toBe('A');
    svc.invalidate('roadmap', 'de');
    expect(await svc.session('roadmap', 'de')).toBe('B');
  });
});
