import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { City, SUPPORTED_CITY_COUNTRIES } from '@okr/shared-models';

@Injectable({ providedIn: 'root' })
export class CityDataService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, Promise<City[]>>();

  /**
   * Returns the city dataset for a country.
   * Every supported country (CH included) is fetched once from /assets/cities/<CC>.json
   * and cached; the files are generated from GeoNames by `tools/generate-city-data.mjs`.
   * Unsupported countries, the server and failed fetches -> [] (a failure is not cached).
   */
  public load(countryCode: string): Promise<City[]> {
    const cc = countryCode.toUpperCase();
    if (!SUPPORTED_CITY_COUNTRIES.includes(cc as never)) return Promise.resolve([]);
    if (!this.isBrowser) return Promise.resolve([]);
    const cached = this.cache.get(cc);
    if (cached) return cached;

    const pending = this.fetchCountry(cc);
    this.cache.set(cc, pending);
    pending.then((cities) => { if (cities.length === 0) this.cache.delete(cc); });
    return pending;
  }

  private async fetchCountry(cc: string): Promise<City[]> {
    try {
      const res = await fetch(`/assets/cities/${cc}.json`);
      if (!res.ok) return [];
      return (await res.json()) as City[];
    } catch {
      return []; // offline before the file was cached
    }
  }
}
