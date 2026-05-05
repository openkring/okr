import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { LocationModel } from '@bk2/shared-models';

interface ConvertLocationRequest {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
}

interface ConvertLocationResponse {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
}

@Injectable({ providedIn: 'root' })
export class LocationConversionService {

  public async convert(location: LocationModel, addressString?: string): Promise<string | undefined> {
    // latitude/longitude default to 0 in LocationModel — treat 0,0 as "not set"
    const lat = (location.latitude !== 0 || location.longitude !== 0) ? location.latitude : undefined;
    const lng = (location.latitude !== 0 || location.longitude !== 0) ? location.longitude : undefined;
    const hasCoords = lat != null && lng != null;
    const hasAddress = !!addressString?.trim();
    const hasW3w = !!location.what3words?.trim();

    if ((hasCoords && hasAddress && hasW3w) || (!hasCoords && !hasAddress && !hasW3w)) return undefined;

    const fn = httpsCallable<ConvertLocationRequest, ConvertLocationResponse>(
      getFunctions(getApp(), 'europe-west6'),
      'convertLocation'
    );

    const { data } = await fn({
      address: addressString || undefined,
      lat,
      lng,
      what3words: location.what3words || undefined,
    });

    if (data.lat != null) location.latitude = data.lat;
    if (data.lng != null) location.longitude = data.lng;
    if (data.what3words) location.what3words = data.what3words;
    return data.address ?? undefined;
  }
}

