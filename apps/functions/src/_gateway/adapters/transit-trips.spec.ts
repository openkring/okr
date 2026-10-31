import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { connectionsFromTripResponse, pickConnections, planTripRequestXml, TransitTripsParams } from './transit-trips';

// a real answer of opentransportdata.swiss (2026-10-31): Zürich Wollishofen → Wädenswil, arrive by 18:00
const fixture = readFileSync(join(__dirname, 'fixtures', 'ojp-trip-arrive-by.xml'), 'utf8');

const params: TransitTripsParams = {
  from: { lat: 47.3445, lng: 8.5335 },
  to: { lat: 47.2305, lng: 8.6735 },
  at: '2026-11-01T17:00:00.000Z',
  anchor: 'arriveBy',
  limit: 3,
};

describe('planTripRequestXml', () => {
  it('puts the time on the destination for arriveBy', () => {
    const xml = planTripRequestXml(params, new Date('2026-10-31T10:00:00.123Z'));
    expect(xml).toMatch(/<Destination>.*<DepArrTime>2026-11-01T17:00:00Z<\/DepArrTime><\/Destination>/s);
    expect(xml).toMatch(/<Origin><PlaceRef>.*<\/PlaceRef><\/Origin>/s);
    expect(xml).toContain('<NumberOfResults>3</NumberOfResults>');
  });

  it('puts the time on the origin for departAt', () => {
    const xml = planTripRequestXml({ ...params, anchor: 'departAt' });
    expect(xml).toMatch(/<Origin>.*<DepArrTime>2026-11-01T17:00:00Z<\/DepArrTime><\/Origin>/s);
    expect(xml).not.toMatch(/<Destination>.*<DepArrTime>/s);
  });
});

describe('connectionsFromTripResponse — real answer', () => {
  const connections = connectionsFromTripResponse(fixture);

  it('reads every trip with start, end and duration', () => {
    expect(connections.length).toBe(3);
    for (const c of connections) {
      expect(Date.parse(c.arrival)).toBeGreaterThan(Date.parse(c.departure));
      expect(c.durationMinutes).toBeGreaterThan(0);
      expect(c.legs.length).toBeGreaterThan(0);
    }
  });

  it('labels trains by their code and buses with the mode name', () => {
    const lines = connections.flatMap((c) => c.legs.filter((l) => l.kind === 'ride').map((l) => l.line));
    expect(lines).toEqual(expect.arrayContaining(['S8']));
    expect(lines).toContain('Bus 70');
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });

  it('reads walks, changes, stops and platforms', () => {
    const legs = connections.flatMap((c) => c.legs);
    expect(legs.some((l) => l.kind === 'walk')).toBe(true);
    expect(legs.some((l) => l.kind === 'transfer')).toBe(true);
    const ride = legs.find((l) => l.kind === 'ride' && l.ptMode === 'rail');
    expect(ride?.from).not.toBe('');
    expect(ride?.to).not.toBe('');
    expect(ride?.platform).not.toBe('');
    expect(ride?.departureDelay).toBe(0);
  });
});

describe('connectionsFromTripResponse — realtime and errors', () => {
  const realtime = `<?xml version="1.0"?><OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0"><OJPResponse><siri:ServiceDelivery><OJPTripDelivery>
    <TripResult><Id>1</Id><Trip><Id>1</Id><Duration>PT34M</Duration><StartTime>2026-11-01T16:13:00Z</StartTime><EndTime>2026-11-01T16:47:00Z</EndTime>
      <Leg><Id>1</Id><Duration>PT34M</Duration><TimedLeg>
        <LegBoard><StopPointName><Text xml:lang="de">Zürich HB</Text></StopPointName><PlannedQuay><Text>3</Text></PlannedQuay><EstimatedQuay><Text>4</Text></EstimatedQuay>
          <ServiceDeparture><TimetabledTime>2026-11-01T16:13:00Z</TimetabledTime><EstimatedTime>2026-11-01T16:15:00Z</EstimatedTime></ServiceDeparture></LegBoard>
        <LegAlight><StopPointName><Text>Wädenswil</Text></StopPointName>
          <ServiceArrival><TimetabledTime>2026-11-01T16:47:00Z</TimetabledTime><EstimatedTime>2026-11-01T16:50:00Z</EstimatedTime></ServiceArrival></LegAlight>
        <Service><PublicCode>S16</PublicCode><Mode><PtMode>rail</PtMode><Name><Text>Zug</Text></Name></Mode><Cancelled>true</Cancelled><DestinationText><Text>Herrliberg</Text></DestinationText></Service>
      </TimedLeg></Leg>
    </Trip></TripResult>
  </OJPTripDelivery></siri:ServiceDelivery></OJPResponse></OJP>`;

  it('reads delays, the estimated platform, the direction and a cancellation', () => {
    const [c] = connectionsFromTripResponse(realtime);
    expect(c.durationMinutes).toBe(34);
    expect(c.legs[0]).toMatchObject({
      kind: 'ride', line: 'S16', from: 'Zürich HB', to: 'Wädenswil', platform: '4', direction: 'Herrliberg',
      departureDelay: 2, arrivalDelay: 3, cancelled: true, departure: '2026-11-01T16:13:00.000Z',
    });
  });

  it('answers empty on an error condition or nothing', () => {
    const none = `<OJP><OJPResponse><ServiceDelivery><OJPTripDelivery><ErrorCondition><TripProblemType>TRIP_NOTRIPFOUND</TripProblemType></ErrorCondition></OJPTripDelivery></ServiceDelivery></OJPResponse></OJP>`;
    expect(connectionsFromTripResponse(none)).toEqual([]);
    expect(connectionsFromTripResponse('')).toEqual([]);
  });
});

describe('pickConnections', () => {
  const c = (dep: string) => ({ departure: dep, arrival: dep, durationMinutes: 1, legs: [] });
  const all = [c('2026-11-01T16:30:00Z'), c('2026-11-01T16:00:00Z'), c('2026-11-01T16:15:00Z'), c('2026-11-01T16:45:00Z')];

  it('keeps the latest connections for arriveBy and the earliest for departAt, in time order', () => {
    expect(pickConnections(all, { ...params, limit: 2 }).map((x) => x.departure)).toEqual(['2026-11-01T16:30:00Z', '2026-11-01T16:45:00Z']);
    expect(pickConnections(all, { ...params, anchor: 'departAt', limit: 2 }).map((x) => x.departure)).toEqual(['2026-11-01T16:00:00Z', '2026-11-01T16:15:00Z']);
  });
});
