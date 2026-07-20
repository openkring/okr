import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export interface FlightInfoRequest {
  flightNumber: string;
  date: string;
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
  status: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: FlightAircraft;
  live?: FlightLivePosition;
}

@Injectable({ providedIn: 'root' })
export class FlightTrackerService {
  public async getFlightInfo(flightNumber: string, date: string): Promise<FlightInfoResponse> {
    const fn = httpsCallable<FlightInfoRequest, FlightInfoResponse>(
      getFunctions(getApp(), 'europe-west6'),
      'getFlightInfo'
    );
    const { data } = await fn({ flightNumber, date });
    return data;
  }
}
