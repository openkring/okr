import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

const aviationApiKey = defineSecret('AVIATIONSTACK_APIKEY');
const AVIATION_BASE = 'https://api.aviationstack.com/v1';

export interface FlightInfoRequest {
  flightNumber: string; // e.g. "LX1234"
  date: string;         // YYYY-MM-DD
}

export interface FlightEndpoint {
  airport: string;
  iata: string;
  terminal?: string;
  gate?: string;
  delay?: number;
  scheduled?: string;
  estimated?: string;
  lat?: number;
  lng?: number;
}

export interface FlightAircraft {
  registration?: string;
  iata?: string;
  icao24?: string;
}

export interface FlightLivePosition {
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed_horizontal: number;
}

export interface FlightInfoResponse {
  flightNumber: string;
  status: string; // 'scheduled' | 'active' | 'landed' | 'cancelled' | 'unknown'
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: FlightAircraft;
  live?: FlightLivePosition;
}

async function resolveAirportCoords(
  iata: string,
  key: string
): Promise<{ lat: number; lng: number } | undefined> {
  const db = getFirestore();
  const snap = await db.collection('locations').doc(iata).get();
  if (snap.exists) {
    const d = snap.data();
    if (d?.latitude != null && d?.longitude != null) {
      return { lat: d.latitude, lng: d.longitude };
    }
    return undefined; // document exists but no coords — don't overwrite
  }
  try {
    const { data } = await axios.get(`${AVIATION_BASE}/airports`, {
      params: { access_key: key, search: iata, limit: 1 },
    });
    const airport = data?.data?.[0];
    if (!airport?.latitude || !airport?.longitude) return undefined;
    const lat = parseFloat(airport.latitude);
    const lng = parseFloat(airport.longitude);
    if (isNaN(lat) || isNaN(lng)) return undefined;
    // Cache without bkey (stripped per project convention — re-attached on read)
    await db.collection('locations').doc(iata).set({
      type: 'airport',
      tenants: ['_global'],
      name: airport.airport_name ?? iata,
      latitude: lat,
      longitude: lng,
      isArchived: false,
      tags: '',
      index: iata.toLowerCase(),
      address: '',
      placeId: '',
      what3words: '',
      seaLevel: 0,
      speed: 0,
      direction: 0,
      distance: 0,
      notes: '',
    });
    return { lat, lng };
  } catch (err: unknown) {
    logger.warn(`resolveAirportCoords: failed for ${iata}`, { err: String(err) });
    return undefined;
  }
}

export const getFlightInfo = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [aviationApiKey],
  },
  async (request: CallableRequest<FlightInfoRequest>): Promise<FlightInfoResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { flightNumber, date } = request.data;
    if (!flightNumber?.trim() || !date?.trim()) {
      throw new HttpsError('invalid-argument', 'flightNumber and date are required');
    }

    const key = aviationApiKey.value();
    logger.info('getFlightInfo', { flightNumber, date });

    let flightRaw: any;
    try {
      const { data } = await axios.get(`${AVIATION_BASE}/flights`, {
        params: {
          access_key: key,
          flight_iata: flightNumber.trim(),
          flight_date: date.trim(),
          limit: 1,
        },
      });
      flightRaw = data;
    } catch (err: unknown) {
      logger.error('getFlightInfo: flights API error', { err: String(err) });
      throw new HttpsError('internal', 'Flight data service error');
    }

    const flight = flightRaw?.data?.[0];
    if (!flight) {
      throw new HttpsError('not-found', `No flight found for ${flightNumber} on ${date}`);
    }

    const dep = flight.departure ?? {};
    const arr = flight.arrival ?? {};

    const [depCoords, arrCoords] = await Promise.all([
      dep.iata ? resolveAirportCoords(dep.iata, key) : Promise.resolve(undefined),
      arr.iata ? resolveAirportCoords(arr.iata, key) : Promise.resolve(undefined),
    ]);

    const result: FlightInfoResponse = {
      flightNumber: flight.flight?.iata ?? flightNumber,
      status: flight.flight_status ?? 'unknown',
      departure: {
        airport: dep.airport ?? '',
        iata: dep.iata ?? '',
        terminal: dep.terminal ?? undefined,
        gate: dep.gate ?? undefined,
        delay: dep.delay ?? undefined,
        scheduled: dep.scheduled ?? undefined,
        estimated: dep.estimated ?? undefined,
        lat: depCoords?.lat,
        lng: depCoords?.lng,
      },
      arrival: {
        airport: arr.airport ?? '',
        iata: arr.iata ?? '',
        terminal: arr.terminal ?? undefined,
        gate: arr.gate ?? undefined,
        delay: arr.delay ?? undefined,
        scheduled: arr.scheduled ?? undefined,
        estimated: arr.estimated ?? undefined,
        lat: arrCoords?.lat,
        lng: arrCoords?.lng,
      },
    };

    if (flight.aircraft) {
      result.aircraft = {
        registration: flight.aircraft.registration ?? undefined,
        iata: flight.aircraft.iata ?? undefined,
        icao24: flight.aircraft.icao24 ?? undefined,
      };
    }

    if (flight.live?.latitude != null && flight.live?.longitude != null) {
      result.live = {
        latitude: flight.live.latitude,
        longitude: flight.live.longitude,
        altitude: flight.live.altitude ?? 0,
        direction: flight.live.direction ?? 0,
        speed_horizontal: flight.live.speed_horizontal ?? 0,
      };
    }

    logger.info('getFlightInfo: done', { flightNumber: result.flightNumber, status: result.status });
    return result;
  }
);
