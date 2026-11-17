import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LocationService } from '@okr/location-data-access';
import type { ConnectionsConfig } from '@okr/shared-models';
import { AddressDirectoryService, AddressService, GeocodingService } from '@okr/subject-address-data-access';

import { TransitPlaceService } from './transit-place.service';

const cfg = {
  destinationKey: '',
  sourceKey: '',
  favoriteDefaultOrg: true,
  favoriteHomeAddress: true,
  favoriteLocationKeys: ['a', 'b'],
  anchor: 'departAt',
  allowAddToCalendar: true,
} as ConnectionsConfig;

const postal = (streetName: string, isFavorite: boolean) => ({
  addressChannel: 'postal', isFavorite, streetName, streetNumber: '1', zipCode: '8712', city: 'Stäfa', countryCode: 'CH',
});

function setup(opts: { home?: Observable<unknown>; dir?: Observable<unknown> } = {}) {
  const geocodeQuiet = vi.fn().mockResolvedValue({ lat: 1, lng: 2 });
  TestBed.configureTestingModule({
    providers: [
      { provide: AddressDirectoryService, useValue: { read: () => opts.dir ?? of({ entries: [
        { addressChannel: 'email', isFavorite: true, streetName: '', streetNumber: '', zipCode: '', city: '', countryCode: '' },
        postal('Nebenweg', false), postal('Seestrasse', true)] }) } },
      { provide: AddressService, useValue: { getFavoritePostalAddress: () => opts.home ?? of(postal('Heimweg', true)) } },
      { provide: LocationService, useValue: { read: (k: string) => of({ okey: k, name: `Loc ${k}`, latitude: 47, longitude: 8 }) } },
      { provide: GeocodingService, useValue: { geocodeQuiet } },
    ],
  });
  return { service: TestBed.inject(TransitPlaceService), geocodeQuiet };
}

const args = { cfg, defaultOrg: { okey: 'o1', name: 'SCS' }, personKey: 'p1', homeLabel: 'Meine Adresse' };

describe('TransitPlaceService', () => {
  it('combines org, home and pinned in order, favourite org address first', async () => {
    const { service } = setup();
    const places = await new Promise<{ kind: string; label: string; address?: string }[]>((r) => service.favorites(args).subscribe(r));
    expect(places.map((p) => p.kind)).toEqual(['org', 'home', 'location', 'location']);
    expect(places[0].address).toBe('Seestrasse 1, 8712 Stäfa, CH');
    expect(places[1].label).toBe('Meine Adresse');
  });

  it('a failing home read still yields org + pinned', async () => {
    const { service } = setup({ home: throwError(() => new Error('denied')) });
    const places = await new Promise<{ kind: string }[]>((r) => service.favorites(args).subscribe(r));
    expect(places.map((p) => p.kind)).toEqual(['org', 'location', 'location']);
  });

  it('skips home without personKey and pinned without keys', async () => {
    const { service } = setup();
    const places = await new Promise<{ kind: string }[]>((r) =>
      service.favorites({ ...args, personKey: undefined, cfg: { ...cfg, favoriteLocationKeys: [] } }).subscribe(r));
    expect(places.map((p) => p.kind)).toEqual(['org']);
  });

  it('resolvePoint: point as is, geocode org/home, undefined for current', async () => {
    const { service, geocodeQuiet } = setup();
    expect(await service.resolvePoint({ kind: 'location', label: 'x', point: { lat: 5, lng: 6 } })).toEqual({ lat: 5, lng: 6 });
    expect(geocodeQuiet).not.toHaveBeenCalled();
    expect(await service.resolvePoint({ kind: 'home', label: 'x', address: 'A 1, 8000 Z' })).toEqual({ lat: 1, lng: 2 });
    expect(geocodeQuiet).toHaveBeenCalledWith('A 1, 8000 Z');
    expect(await service.resolvePoint({ kind: 'current', label: 'x' })).toBeUndefined();
  });
});
