import { inject, Injectable } from '@angular/core';
import { catchError, combineLatest, map, Observable, of, take } from 'rxjs';

import { LocationService } from '@okr/location-data-access';
import { favoritePlaces, LatLng, postalLine, TransitPlace } from '@okr/mobility-transit-util';
import type { ConnectionsConfig, LocationModel } from '@okr/shared-models';
import { AddressDirectoryService, AddressService, GeocodingService } from '@okr/subject-address-data-access';

/**
 * Spec 1.162 — resolves the Von/Nach favourites from the database. The home address is read only for the viewer
 * themself, is never logged and is geocoded only on a tap, through `resolvePoint`.
 */
@Injectable({ providedIn: 'root' })
export class TransitPlaceService {
  private readonly directory = inject(AddressDirectoryService);
  private readonly addresses = inject(AddressService);
  private readonly locations = inject(LocationService);
  private readonly geocoding = inject(GeocodingService);

  public favorites(args: {
    cfg: ConnectionsConfig;
    defaultOrg?: { okey: string; name: string };
    personKey?: string;
    homeLabel: string;
  }): Observable<TransitPlace[]> {
    const { cfg, defaultOrg, personKey, homeLabel } = args;

    const org$: Observable<{ name: string; address: string } | undefined> = defaultOrg
      ? this.directory.read(`org.${defaultOrg.okey}`).pipe(
          take(1),
          map((dir) => {
            const postal = (dir?.entries ?? []).filter((e) => e.addressChannel === 'postal');
            const entry = postal.find((e) => e.isFavorite) ?? postal[0];
            const address = entry ? postalLine(entry) : '';
            return address ? { name: defaultOrg.name, address } : undefined;
          }),
          catchError(() => of(undefined)),
        )
      : of(undefined);

    const home$: Observable<string | undefined> = personKey
      ? this.addresses.getFavoritePostalAddress(`person.${personKey}`).pipe(
          take(1),
          map((a) => (a ? postalLine(a) || undefined : undefined)),
          catchError(() => of(undefined)),
        )
      : of(undefined);

    const keys = cfg.favoriteLocationKeys ?? [];
    const pinned$: Observable<LocationModel[]> = keys.length
      ? combineLatest(
          keys.map((k) => this.locations.read(k).pipe(take(1), catchError(() => of(undefined)))),
        ).pipe(map((locs) => locs.filter((l): l is LocationModel => !!l)))
      : of([]);

    return combineLatest([org$, home$, pinned$]).pipe(
      map(([org, home, pinned]) => {
        const input: Parameters<typeof favoritePlaces>[0] = { cfg, pinned, homeLabel };
        if (org) input.org = org;
        if (home) input.home = home;
        return favoritePlaces(input);
      }),
    );
  }

  /** The coordinates of a place; `undefined` for `current` (the component asks the device) or when geocoding fails. */
  public async resolvePoint(p: TransitPlace): Promise<LatLng | undefined> {
    if (p.point) return p.point;
    if ((p.kind === 'org' || p.kind === 'home') && p.address) {
      return this.geocoding.geocodeQuiet(p.address);
    }
    return undefined;
  }
}
