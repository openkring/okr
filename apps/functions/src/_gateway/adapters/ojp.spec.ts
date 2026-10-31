// apps/functions/src/_gateway/adapters/ojp.spec.ts
import { describe, it, expect } from 'vitest';
import { routeFromTripResponse, tripRequestXml, OjpRouteParams } from './ojp';

const params: OjpRouteParams = {
  mode: 'train',
  from: { lat: 46.70, lng: 8.79 },
  to: { lat: 46.68, lng: 8.75 },
  startedAt: '2026-10-30T15:32:58.000Z',
  endedAt: '2026-10-30T15:37:18.000Z',
};

const pos = (lat: number, lng: number) => `<Position><siri:Longitude>${lng}</siri:Longitude><siri:Latitude>${lat}</siri:Latitude></Position>`;

function timedLeg(mode: string, board: string, alight: string, line: string, coords: [number, number][]): string {
  return `<Leg><Id>1</Id><TimedLeg>
    <LegBoard><ServiceDeparture><TimetabledTime>${board}</TimetabledTime></ServiceDeparture></LegBoard>
    <LegAlight><ServiceArrival><TimetabledTime>${alight}</TimetabledTime></ServiceArrival></LegAlight>
    <Service><Mode><PtMode>${mode}</PtMode></Mode><PublishedServiceName><Text>${line}</Text></PublishedServiceName></Service>
    <LegTrack><TrackSection><LinkProjection>${coords.map(([a, b]) => pos(a, b)).join('')}</LinkProjection></TrackSection></LegTrack>
  </TimedLeg></Leg>`;
}

const walk = `<Leg><Id>0</Id><ContinuousLeg><LegStart><GeoPosition><siri:Longitude>8.79</siri:Longitude><siri:Latitude>46.70</siri:Latitude></GeoPosition></LegStart><Service><PersonalMode>foot</PersonalMode></Service></ContinuousLeg></Leg>`;

function response(trips: string[]): string {
  return `<?xml version="1.0"?><OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0"><OJPResponse><siri:ServiceDelivery><OJPTripDelivery>
    ${trips.map((t, i) => `<TripResult><Id>${i}</Id><Trip><Id>${i}</Id>${t}</Trip></TripResult>`).join('')}
  </OJPTripDelivery></siri:ServiceDelivery></OJPResponse></OJP>`;
}

describe('tripRequestXml', () => {
  it('asks for leg projection from a GeoPosition, departing 15 minutes early, in UTC with seconds', () => {
    const xml = tripRequestXml(params, new Date('2026-10-31T10:00:00.123Z'));
    expect(xml).toContain('<IncludeLegProjection>true</IncludeLegProjection>');
    expect(xml).toContain('<siri:Longitude>8.79</siri:Longitude><siri:Latitude>46.7</siri:Latitude>');
    expect(xml).toContain('<DepArrTime>2026-10-30T15:17:58Z</DepArrTime>');
    expect(xml).toContain('<siri:RequestTimestamp>2026-10-31T10:00:00Z</siri:RequestTimestamp>');
  });
});

describe('routeFromTripResponse', () => {
  it('takes the trip whose times fit and only its legs of the recorded mode', () => {
    const early = timedLeg('rail', '2026-10-30T14:32:00Z', '2026-10-30T14:37:00Z', 'R 1', [[46.70, 8.79], [46.6, 8.6]]);
    const fits = timedLeg('rail', '2026-10-30T15:32:00Z', '2026-10-30T15:38:00Z', 'R 2', [[46.70, 8.79], [46.69, 8.77], [46.68, 8.75]]);
    const route = routeFromTripResponse(response([early, walk + fits]), params);
    expect(route.line).toBe('R 2');
    expect(route.points).toEqual([{ lat: 46.70, lng: 8.79 }, { lat: 46.69, lng: 8.77 }, { lat: 46.68, lng: 8.75 }]);
  });

  it('ignores another mode and answers empty when nothing fits', () => {
    const bus = timedLeg('bus', '2026-10-30T15:32:00Z', '2026-10-30T15:38:00Z', 'Bus 1', [[46.70, 8.79], [46.68, 8.75]]);
    expect(routeFromTripResponse(response([bus]), params)).toEqual({ points: [], line: '' });
    expect(routeFromTripResponse(response([]), params)).toEqual({ points: [], line: '' });
    expect(routeFromTripResponse('', params)).toEqual({ points: [], line: '' });
  });

  it('prefers estimated over timetabled times', () => {
    const late = timedLeg('rail', '2026-10-30T15:10:00Z', '2026-10-30T15:15:00Z', 'R 3', [[46.70, 8.79], [46.68, 8.75]])
      .replace('<TimetabledTime>2026-10-30T15:10:00Z</TimetabledTime>', '<TimetabledTime>2026-10-30T15:10:00Z</TimetabledTime><EstimatedTime>2026-10-30T15:31:00Z</EstimatedTime>')
      .replace('<TimetabledTime>2026-10-30T15:15:00Z</TimetabledTime>', '<TimetabledTime>2026-10-30T15:15:00Z</TimetabledTime><EstimatedTime>2026-10-30T15:37:00Z</EstimatedTime>');
    expect(routeFromTripResponse(response([late]), params).line).toBe('R 3');
  });
});
