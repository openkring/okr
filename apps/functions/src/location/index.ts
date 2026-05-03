import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';

const w3wApiKey = defineSecret('W3W_APIKEY');
const gmapKey = defineSecret('GMAP_KEY');

const W3W_BASE = 'https://api.what3words.com/v3';
const GMAP_BASE = 'https://maps.googleapis.com/maps/api';

export interface ConvertLocationRequest {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
}

export interface ConvertLocationResponse {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
}

async function w3wToCoords(words: string, key: string): Promise<{ lat: number; lng: number } | undefined> {
  const { data } = await axios.get(`${W3W_BASE}/convert-to-coordinates`, { params: { words, key } });
  const c = data?.coordinates;
  return c ? { lat: c.lat, lng: c.lng } : undefined;
}

async function coordsToW3w(lat: number, lng: number, key: string): Promise<string | undefined> {
  const { data } = await axios.get(`${W3W_BASE}/convert-to-3wa`, {
    params: { coordinates: `${lat},${lng}`, key, language: 'en' },
  });
  return data?.words;
}

async function geocode(address: string, key: string): Promise<{ lat: number; lng: number } | undefined> {
  const { data } = await axios.get(`${GMAP_BASE}/geocode/json`, { params: { address, key } });
  const loc = data?.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : undefined;
}

async function reverseGeocode(lat: number, lng: number, key: string): Promise<string | undefined> {
  const { data } = await axios.get(`${GMAP_BASE}/geocode/json`, { params: { latlng: `${lat},${lng}`, key } });
  return data?.results?.[0]?.formatted_address;
}

export const convertLocation = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [w3wApiKey, gmapKey],
  },
  async (request: CallableRequest<ConvertLocationRequest>): Promise<ConvertLocationResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const input = request.data;
    // treat 0,0 as "not set" — it is the LocationModel default, not a real coordinate
    const hasRealCoords = (input.lat !== 0 || input.lng !== 0) && input.lat != null && input.lng != null;
    const result: ConvertLocationResponse = {
      address: input.address?.trim() || undefined,
      lat: hasRealCoords ? input.lat : undefined,
      lng: hasRealCoords ? input.lng : undefined,
      what3words: input.what3words?.trim() || undefined,
    };

    logger.info('convertLocation: start', {
      hasAddress: !!result.address,
      hasCoords: result.lat != null && result.lng != null,
      hasW3w: !!result.what3words,
    });

    try {
      // Step 1: w3w → coords (most precise when available)
      if (result.what3words && (result.lat == null || result.lng == null)) {
        const coords = await w3wToCoords(result.what3words, w3wApiKey.value());
        if (coords) { result.lat = coords.lat; result.lng = coords.lng; }
      }

      // Step 2: address → coords (if coords still missing)
      if (result.address && (result.lat == null || result.lng == null)) {
        const coords = await geocode(result.address, gmapKey.value());
        if (coords) { result.lat = coords.lat; result.lng = coords.lng; }
      }

      // Step 3: coords → address (if address missing)
      if (result.lat != null && result.lng != null && !result.address) {
        result.address = await reverseGeocode(result.lat, result.lng, gmapKey.value());
      }

      // Step 4: coords → w3w (if w3w missing)
      if (result.lat != null && result.lng != null && !result.what3words) {
        result.what3words = await coordsToW3w(result.lat, result.lng, w3wApiKey.value());
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('convertLocation: failed', { message });
      throw new HttpsError('internal', message);
    }

    logger.info('convertLocation: result', result);
    return result;
  }
);
