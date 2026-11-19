import { afterEach, describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { CityDataService } from './city-data.service';

describe('CityDataService', () => {
  // Vitest 4 returns the existing spy on a re-spied method, so calls would carry over.
  afterEach(() => vi.restoreAllMocks());

  function make(platform = 'browser') {
    TestBed.configureTestingModule({
      providers: [CityDataService, { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(CityDataService);
  }

  it('fetches CH from the assets like every other country', async () => {
    const payload = [{ zipCode: '6718', name: 'Olivone', stateCode: 'TI', countryCode: 'CH', municipality: 'Blenio', municipalityCode: '5049' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }));
    expect(await make().load('ch')).toEqual(payload);
    expect(fetchSpy).toHaveBeenCalledWith('/assets/cities/CH.json');
  });

  it('returns [] for an unsupported country', async () => {
    expect(await make().load('ZZ')).toEqual([]);
  });

  it('fetches, maps and caches a supported country', async () => {
    const payload = [{ zipCode: '10115', name: 'Berlin', stateCode: 'BE', countryCode: 'DE' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }));
    const svc = make();
    const first = await svc.load('DE');
    const second = await svc.load('DE');
    expect(first).toEqual(payload);
    expect(second).toBe(first);              // cached, same reference
    expect(fetchSpy).toHaveBeenCalledTimes(1); // fetched once
  });

  it('returns [] on the server (no browser)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await make('server').load('DE')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not cache a failed fetch, so the next call retries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ zipCode: '9490', name: 'Vaduz', stateCode: '', countryCode: 'LI' }]), { status: 200 }));
    const svc = make();
    expect(await svc.load('LI')).toEqual([]);
    expect((await svc.load('LI')).length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
