import { describe, expect, it } from 'vitest';
import { footprintPosition, routePoints } from './journal-position.util';

describe('journal position', () => {
  it('footprintPosition skips 0,0 and missing GPS', () => {
    expect(footprintPosition([
      { takenAt: '2027-01-14T09:00:00' },
      { takenAt: '2027-01-14T09:05:00', latitude: 0, longitude: 0 },
      { takenAt: '2027-01-14T09:10:00', latitude: -64.83, longitude: -62.53 },
    ])).toEqual({ latitude: -64.83, longitude: -62.53 });
    expect(footprintPosition([{ takenAt: '2027-01-14T09:00:00' }])).toBeUndefined();
  });

  it('footprintPosition uses the earliest photo with GPS, not the first in the list', () => {
    expect(footprintPosition([
      { takenAt: '2027-01-14T11:00:00', latitude: -64.9, longitude: -62.9 },
      { takenAt: '2027-01-14T09:00:00', latitude: -64.83, longitude: -62.53 },
    ])).toEqual({ latitude: -64.83, longitude: -62.53 });
  });

  it('routePoints are in time order', () => {
    expect(routePoints([
      { takenAt: '2027-01-14T11:00:00', latitude: -64.9, longitude: -62.9 },
      { takenAt: '2027-01-13T08:00:00', latitude: -62.97, longitude: -60.6 },
      { takenAt: '2027-01-13T09:00:00' },
      { takenAt: '2027-01-14T09:00:00', latitude: -64.83, longitude: -62.53 },
    ])).toEqual([[-62.97, -60.6], [-64.83, -62.53], [-64.9, -62.9]]);
  });

  it('a GPS photo without a date still gives a position, after the dated ones', async () => {
    const { footprintPosition } = await import('./journal-position.util');
    expect(footprintPosition([{ latitude: -64.8, longitude: -62.5 }])).toEqual({ latitude: -64.8, longitude: -62.5 });
    expect(footprintPosition([{ latitude: 1, longitude: 1 }, { takenAt: '2027-01-14T09:00:00', latitude: 2, longitude: 2 }]))
      .toEqual({ latitude: 2, longitude: 2 });
  });
});
