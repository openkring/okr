import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { locationRequestXml, stopsFromLocationResponse } from './transit-stops';

// a real answer of opentransportdata.swiss (2026-10-31): stops within 1 km of the Seeclub Stäfa boathouse
const fixture = readFileSync(join(__dirname, 'fixtures', 'ojp-location-stops.xml'), 'utf8');
const near = { lat: 47.2444, lng: 8.7106, radiusM: 1000 };

describe('locationRequestXml', () => {
  it('searches stops in a circle around the point', () => {
    const xml = locationRequestXml({ near, limit: 10 });
    expect(xml).toContain('<OJPLocationInformationRequest>');
    expect(xml).toMatch(/<Circle><Center><siri:Longitude>8.7106<\/siri:Longitude><siri:Latitude>47.2444<\/siri:Latitude><\/Center><Radius>1000<\/Radius><\/Circle>/);
    expect(xml).toContain('<Type>stop</Type>');
  });

  it('searches by name, escaped', () => {
    expect(locationRequestXml({ query: 'Bern <HB>', limit: 5 })).toContain('<Name>Bern &#60;HB&#62;</Name>');
  });
});

describe('stopsFromLocationResponse — real answer', () => {
  it('reads the stops and sorts them by distance from the point', () => {
    const stops = stopsFromLocationResponse(fixture, { near, limit: 10 });
    expect(stops.map((s) => s.name)).toEqual(['Männedorf, Sonnenfeld', 'Stäfa, Strandbad']);
    expect(stops[0]).toMatchObject({ stopRef: 'ch:1:sloid:87689', lat: 47.24728, lng: 8.70692 });
    expect(stops[0].distanceM).toBeGreaterThan(300);
    expect(stops[0].distanceM).toBeLessThan(stops[1].distanceM ?? 0);
  });

  it('honours the limit and leaves out the distance for a search by name', () => {
    const stops = stopsFromLocationResponse(fixture, { query: 'Stäfa', limit: 1 });
    expect(stops).toHaveLength(1);
    expect(stops[0].distanceM).toBeUndefined();
  });

  it('is empty for no answer', () => {
    expect(stopsFromLocationResponse('', { near, limit: 10 })).toEqual([]);
  });
});
