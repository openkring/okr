import { describe, expect, it } from 'vitest';
import { distanceKm, foldName } from './geo.util';

describe('foldName', () => {
  it('folds case, diacritics and whitespace', () => {
    expect(foldName('  Pfäffikon,  SZ ')).toBe('pfaffikon, sz');
  });
});

describe('distanceKm', () => {
  it('measures Pfäffikon SZ to Stäfa', () => {
    const d = distanceKm({ lat: 47.2, lng: 8.7819 }, { lat: 47.2683, lng: 8.724 });
    expect(Math.abs(d - 8.7)).toBeLessThan(0.1);
  });
  it('is 0 for the same point', () => {
    const p = { lat: 47.2, lng: 8.78 };
    expect(distanceKm(p, p)).toBe(0);
  });
});
