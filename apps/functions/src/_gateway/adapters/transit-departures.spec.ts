import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { departureMode, departuresFromStopEventResponse, situationOf, stopEventRequestXml } from './transit-departures';

// real answers of opentransportdata.swiss (2026-10-31, ~23:15 local), OperatingDays and Places trimmed
const strandbad = readFileSync(join(__dirname, 'fixtures', 'ojp-stop-event-strandbad.xml'), 'utf8');
const zurich = readFileSync(join(__dirname, 'fixtures', 'ojp-stop-event-zurich-hb.xml'), 'utf8');
const NOW = new Date('2026-10-31T22:15:30Z');

describe('stopEventRequestXml', () => {
  it('asks for realtime departures from now at the stop, without the calls before and after', () => {
    const xml = stopEventRequestXml({ stopRef: 'ch:1:sloid:88139' }, new Date('2026-10-31T22:15:30.123Z'));
    expect(xml).toContain('<OJPStopEventRequest>');
    expect(xml).toContain('<siri:StopPointRef>ch:1:sloid:88139</siri:StopPointRef>');
    expect(xml).toContain('<DepArrTime>2026-10-31T22:15:30Z</DepArrTime>');
    expect(xml).toContain('<StopEventType>departure</StopEventType>');
    expect(xml).toContain('<UseRealtimeData>full</UseRealtimeData>');
  });
});

describe('departuresFromStopEventResponse — a quiet bus stop', () => {
  const res = departuresFromStopEventResponse(strandbad, NOW);

  it('reads the stop name and the bus departures', () => {
    expect(res.stopName).toBe('Stäfa, Strandbad');
    expect(res.departures.length).toBeGreaterThan(0);
    expect(res.departures[0]).toMatchObject({ line: '925', mode: 'bus', destination: 'Stäfa, Bahnhof', cancelled: false });
    expect(res.departures[0].plannedAt).toBe('2026-10-31T22:30:24.000Z');
    expect(res.situations).toEqual([]);
    expect(res.fetchedAt).toBe(NOW.toISOString());
  });
});

describe('departuresFromStopEventResponse — Zürich HB with a disruption', () => {
  const res = departuresFromStopEventResponse(zurich, NOW);

  it('reads line, quay (realtime first) and the delayed estimate', () => {
    expect(res.departures.map((d) => d.line)).toEqual(['IC3', 'S12', 'S16', 'S12', 'S16']);
    expect(res.departures.every((d) => d.mode === 'train')).toBe(true);
    expect(res.departures[0]).toMatchObject({ destination: 'Basel SBB', quay: '12', estimatedAt: '2026-10-31T22:31:00.000Z' });
    expect(res.departures[1].quay).toBe('42');
  });

  it('reads the published situation and links it to the departures that reference it', () => {
    expect(res.situations).toHaveLength(1);
    const s = res.situations[0];
    expect(s.summary).toMatch(/^Der Bahnverkehr zwischen Zürich HB und Seuzach/);
    expect(s.detail).toMatch(/Bauarbeiten.*Online-Fahrplan/s);
    expect(s).toMatchObject({ priority: 3, planned: true, active: false });
    expect(res.departures.some((d) => d.situationIds.includes(s.id))).toBe(true);
  });

  it('marks the situation active inside a validity period, and drops it outside the publication window', () => {
    expect(departuresFromStopEventResponse(zurich, new Date('2026-11-01T21:00:00Z')).situations[0].active).toBe(true);
    const after = departuresFromStopEventResponse(zurich, new Date('2026-11-03T12:00:00Z'));
    expect(after.situations).toEqual([]);
    expect(after.departures.every((d) => d.situationIds.length === 0)).toBe(true);
  });
});

describe('departuresFromStopEventResponse — degenerate input', () => {
  it('is empty for no answer', () => {
    expect(departuresFromStopEventResponse('', NOW)).toMatchObject({ stopName: '', departures: [], situations: [] });
  });
});

describe('situationOf', () => {
  it('skips a situation without text or id, falls back to the bare Summary', () => {
    expect(situationOf({ SituationNumber: 'x' }, NOW.getTime())).toBeUndefined();
    expect(situationOf({ SituationNumber: 'x', Summary: 'Störung', Priority: '1' }, NOW.getTime()))
      .toEqual({ id: 'x', summary: 'Störung', detail: '', priority: 1, active: true, planned: false });
  });
});

describe('departureMode', () => {
  it('maps the OJP modes the board has icons for', () => {
    expect(departureMode('rail')).toBe('train');
    expect(departureMode('bus')).toBe('bus');
    expect(departureMode('tram')).toBe('tram');
    expect(departureMode('water')).toBe('ship');
    expect(departureMode('telecabin')).toBe('cableway');
    expect(departureMode('unknown')).toBe('other');
  });
});
