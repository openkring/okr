import { describe, it, expect } from 'vitest';
import { validPlan, validRoute } from './index';

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
