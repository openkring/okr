import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { AddressModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';

import { stringifyAddress } from '@okr/subject-address-util';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly alertService = inject(AlertService);
  private readonly env = inject(ENV);
  private readonly apiUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
  private readonly http = inject(HttpClient);

  /**
   * Convert an address to latitude and longitude coordinates using the Google Maps Geocoding API
   * @param address in stringified format or as an AddressModel
   * @returns latitude and longitude coordinates as numbers
   */
  public async geocodeAddress(address: AddressModel | string): Promise<GeoCoordinates | undefined> {
    if (!address) return undefined;
    let addressStr = '';
    if (typeof address === 'string') {
      addressStr = address; 
    } else {      // address is of type AddressModel
      if (address.addressChannel !== 'postal') return undefined;
      addressStr = stringifyAddress(address);
    }

    const result = await this.geocodeQuiet(addressStr);
    if (!result) this.alertService.error('Address not found');
    return result;
  }

  /**
   * Quiet variant of geocodeAddress: no alert and no console output (the address is personal data
   * and an HttpErrorResponse carries it in its URL). Callers show their own message.
   * @param address stringified address
   * @returns coordinates, or undefined on zero results or any failure
   */
  public async geocodeQuiet(address: string): Promise<GeoCoordinates | undefined> {
    if (!address) return undefined;
    const params = { address, key: this.env.services.gmapKey };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await firstValueFrom(this.http.get<any>(this.apiUrl, { params }));
      const location = result?.results?.[0]?.geometry?.location;
      if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
        return { lat: location.lat, lng: location.lng };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
