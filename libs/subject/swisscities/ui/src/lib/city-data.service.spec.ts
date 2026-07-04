import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { CityDataService } from './city-data.service';

describe('CityDataService', () => {
  function make(platform: string = 'browser') {
    TestBed.configureTestingModule({
      providers: [CityDataService, { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(CityDataService);
  }

  it('returns the in-bundle Swiss array for CH without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const cities = await make().load('CH');
    expect(cities.length).toBeGreaterThan(1000);
    expect(cities.every(c => c.countryCode === 'CH')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
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
});
