import { describe, it, expect } from 'vitest';
import { validDepartures, validPlan, validRoute, validStops } from './index';

const ok = { mode: 'train', from: { lat: 46.700001, lng: 8.79 }, to: { lat: 46.68, lng: 8.75 }, startedAt: '2026-10-30T15:32:58.500Z', endedAt: '2026-10-30T15:37:17.993Z' };

describe('validRoute', () => {
  it('rounds the points and normalises the times', () => {
    const r = validRoute(ok);
    expect(r.from).toEqual({ lat: 46.7, lng: 8.79 });
    expect(r.startedAt).toBe('2026-10-30T15:32:58.500Z');
  });

  it('rejects a foot section, bad points and an end before the start', () => {
    expect(() => validRoute({ ...ok, mode: 'foot' })).toThrow();
    expect(() => validRoute({ ...ok, from: { lat: 200, lng: 8 } })).toThrow();
    expect(() => validRoute({ ...ok, endedAt: '2026-10-30T15:00:00Z' })).toThrow();
  });
});

describe('validPlan', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const plan = { from: { lat: 47.344512345, lng: 8.5335 }, to: { lat: 47.2305, lng: 8.6735 }, at: '2026-11-01T17:00:42.500Z', anchor: 'arriveBy' };

  it('rounds the points, cuts the time to the minute and defaults the limit', () => {
    expect(validPlan(plan, now)).toEqual({
      from: { lat: 47.34451, lng: 8.5335 }, to: { lat: 47.2305, lng: 8.6735 }, at: '2026-11-01T17:00:00.000Z', anchor: 'arriveBy', limit: 3,
    });
  });

  it('rejects a bad anchor, limit or point and a time outside the window', () => {
    expect(() => validPlan({ ...plan, anchor: 'whenever' }, now)).toThrow();
    expect(() => validPlan({ ...plan, limit: 6 }, now)).toThrow();
    expect(() => validPlan({ ...plan, limit: 0 }, now)).toThrow();
    expect(() => validPlan({ ...plan, to: { lat: 91, lng: 8 } }, now)).toThrow();
    expect(() => validPlan({ ...plan, at: '2026-10-31T10:30:00Z' }, now)).toThrow();
    expect(() => validPlan({ ...plan, at: '2027-01-15T10:00:00Z' }, now)).toThrow();
    expect(() => validPlan({ ...plan, at: 'soon' }, now)).toThrow();
  });
});

describe('validStops', () => {
  it('rounds the point to 4 decimals, defaults and caps the radius', () => {
    expect(validStops({ near: { lat: 47.244364, lng: 8.710580 } })).toEqual({ near: { lat: 47.2444, lng: 8.7106, radiusM: 1000 }, limit: 10 });
    expect(validStops({ near: { lat: 47.2, lng: 8.7, radiusM: 9000 }, limit: 3 }).near?.radiusM).toBe(2000);
  });

  it('takes a trimmed, capped name query', () => {
    expect(validStops({ query: '  Stäfa  ' })).toEqual({ query: 'Stäfa', limit: 10 });
    expect(validStops({ query: 'x'.repeat(200) }).query).toHaveLength(80);
  });

  it('rejects no input, a too short query, a bad radius or limit', () => {
    expect(() => validStops({})).toThrow();
    expect(() => validStops({ query: 'a' })).toThrow();
    expect(() => validStops({ near: { lat: 47, lng: 8, radiusM: -1 } })).toThrow();
    expect(() => validStops({ near: { lat: 47, lng: 8 }, limit: 21 })).toThrow();
  });
});

describe('validDepartures', () => {
  it('accepts sloid and DiDok stop ids and defaults the limit', () => {
    expect(validDepartures({ stopRef: 'ch:1:sloid:88139' })).toEqual({ stopRef: 'ch:1:sloid:88139', limit: 10 });
    expect(validDepartures({ stopRef: 'ch:1:sloid:3000:7:12', limit: 20 }).limit).toBe(20);
    expect(validDepartures({ stopRef: ' 8503000 ' }).stopRef).toBe('8503000');
  });

  it('rejects anything else', () => {
    expect(() => validDepartures({ stopRef: '<x/>' })).toThrow();
    expect(() => validDepartures({ stopRef: 'de:08111:6115' })).toThrow();
    expect(() => validDepartures({ stopRef: '8503000', limit: 0 })).toThrow();
  });
});
