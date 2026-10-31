import { describe, it, expect } from 'vitest';
import { validRoute } from './index';

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
