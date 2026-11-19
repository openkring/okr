import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { City, SUPPORTED_CITY_COUNTRIES } from '@okr/shared-models';
import { swissCities } from './swisscities.data';

@Injectable({ providedIn: 'root' })
export class CityDataService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, City[]>();

  /**
   * Returns the city dataset for a country.
   * CH is served from the in-bundle array; DE/AT/IT/FR/US/GB are fetched once
   * from /assets/cities/<CC>.json and cached. Unsupported countries -> [].
   */
  public async load(countryCode: string): Promise<City[]> {
    const cc = countryCode.toUpperCase();
    if (cc === 'CH') return swissCities as City[];
    if (!SUPPORTED_CITY_COUNTRIES.includes(cc as never)) return [];
    if (!this.isBrowser) return [];
    const cached = this.cache.get(cc);
    if (cached) return cached;

    const res = await fetch(`/assets/cities/${cc}.json`);
    if (!res.ok) return [];
    const cities = (await res.json()) as City[];
    this.cache.set(cc, cities);
    return cities;
  }
}
