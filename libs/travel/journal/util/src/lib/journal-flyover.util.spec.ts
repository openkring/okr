import { describe, expect, it } from 'vitest';
import { CLOSING_MS, FlyStop, flyoverTimeline, greatCircle, OPENING_MS, stopTime } from './journal-flyover.util';

const stop = (key: string, lng: number, lat: number, at: string, transport?: FlyStop['transport']): FlyStop => ({ key, lat, lng, at, title: key, transport });

describe('journal flyover timeline', () => {
  it('fewer than two stops give no timeline', () => {
    expect(flyoverTimeline([], [])).toBeUndefined();
    expect(flyoverTimeline([stop('a', 0, 0, '2027-01-01T10:00')], [])).toBeUndefined();
  });

  it('a leg takes the transport of its end stop', () => {
    const t = flyoverTimeline([stop('a', -68.3, -54.8, '2027-01-08T10:00'), stop('b', -60.6, -63.0, '2027-01-10T09:00', 'ship')], []);
    expect(t?.legs).toHaveLength(1);
    expect(t?.legs[0].transport).toBe('ship');
    expect(t?.legs[0].to.key).toBe('b');
    expect(t?.start.key).toBe('a');
  });

  it('photo points between two stops shape the path', () => {
    const t = flyoverTimeline(
      [stop('a', 0, 0, '2027-01-01T10:00', undefined), stop('b', 10, 0, '2027-01-03T10:00', 'ship')],
      [{ lng: 5, lat: 2, at: '2027-01-02T08:00:00' }, { lng: 50, lat: 50, at: '2027-01-05T08:00:00' }, { lng: 1, lat: 1, at: '' }],
    );
    expect(t?.legs[0].path).toEqual([[0, 0], [5, 2], [10, 0]]);
  });

  it('plane legs are great-circle arcs', () => {
    const t = flyoverTimeline([stop('zrh', 8.55, 47.46, '2027-01-05T10:00'), stop('gru', -46.47, -23.43, '2027-01-06T06:00', 'plane')], []);
    const path = t?.legs[0].path ?? [];
    expect(path.length).toBeGreaterThan(10);
    expect(path[0]).toEqual([8.55, 47.46]);
    expect(path[path.length - 1][0]).toBeCloseTo(-46.47, 6);
    expect(path[path.length - 1][1]).toBeCloseTo(-23.43, 6);
  });

  it('arc crosses 180°', () => {
    const arc = greatCircle([170, -40], [-170, -40], 20);
    for (let i = 1; i < arc.length; i++) expect(Math.abs(arc[i][0] - arc[i - 1][0])).toBeLessThan(5); // continuous, the short way
    expect(arc[arc.length - 1][0]).toBeCloseTo(190, 6); // unwrapped east of 180
  });

  it('legs share the time evenly', () => {
    const stops = (n: number) => Array.from({ length: n }, (_, i) => stop(`s${i}`, i, 0, `2027-01-${String(1 + Math.floor(i / 3)).padStart(2, '0')}T${String(8 + (i % 3)).padStart(2, '0')}:00`));
    expect(flyoverTimeline(stops(10), [])?.legs.every((l) => l.durationMs === 4000)).toBe(true);
    expect(flyoverTimeline(stops(60), [])?.legs[0].durationMs).toBe(Math.round(100_000 / 59));
  });

  it('long trips stay within two minutes', () => {
    const many = Array.from({ length: 200 }, (_, i) => stop(`s${i}`, i % 50, 0, `2027-01-01T00:${String(i).padStart(3, '0')}`));
    const t = flyoverTimeline(many, []);
    expect(t?.totalMs).toBeLessThanOrEqual(125_000);
    expect(t?.totalMs).toBe(OPENING_MS + CLOSING_MS + (t?.legs.reduce((n, l) => n + l.durationMs, 0) ?? 0));
  });

  it('a footprint time becomes a sortable timestamp', () => {
    expect(stopTime('20270114', '09:30')).toBe('2027-01-14T09:30');
    expect(stopTime('20270114', '')).toBe('2027-01-14T12:00');
    expect(stopTime('', '09:30')).toBe('');
  });
});
