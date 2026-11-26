// apps/functions/src/_gateway/adapters/places.spec.ts
import { describe, it, expect } from 'vitest';
import { isLakeArea, mapPlaces, originsFor, placeSearchParams, placesAdapter, type SearchServerBody } from './places';
import pfaeffikonJson from './fixtures/places-pfaeffikon.json';
import zuerichseeJson from './fixtures/places-zuerichsee.json';

const pfaeffikon = pfaeffikonJson as unknown as SearchServerBody;
const zuerichsee = zuerichseeJson as unknown as SearchServerBody;

function row(origin: string, label: string, lat = 47.1, lon = 8.7) {
  return { attrs: { origin, label, lat, lon } };
}
const body = (...rows: ReturnType<typeof row>[]) => ({ results: rows }) as SearchServerBody;

describe('mapPlaces', () => {
  it('maps a gazetteer Ort', () => {
    const hits = mapPlaces(pfaeffikon, { text: 'Pfäffikon' });
    expect(hits).toContainEqual(expect.objectContaining({
      name: 'Pfäffikon SZ', kind: 'locality', typeLabel: 'Ort', canton: 'SZ', municipality: 'Freienbach' }));
  });
  it('maps gg25 to municipality with the canton as suffix', () => {
    expect(mapPlaces(pfaeffikon, { text: 'Pfäffikon' })[0])
      .toMatchObject({ name: 'Pfäffikon ZH', kind: 'municipality', canton: 'ZH', municipality: '', typeLabel: '' });
  });
  it('maps See and Fliessgewaesser to water, several cantons to canton ""', () => {
    const lake = mapPlaces(zuerichsee, { text: 'Zürichsee' }).find((h) => h.name === 'Zürichsee');
    expect(lake).toMatchObject({ kind: 'water', canton: '', municipality: '' });
    const creek = mapPlaces(zuerichsee, { text: 'Zürichsee' }).find((h) => h.typeLabel === 'Fliessgewaesser');
    expect(creek).toMatchObject({ kind: 'water', canton: '' });
  });
  it('maps a gg25 lake area (recorded «Zürichsee (ZH)») to water, not municipality', () => {
    const lake = mapPlaces(zuerichsee, { text: 'Zürichsee' }).find((h) => h.name === 'Zürichsee ZH');
    expect(lake).toMatchObject({ kind: 'water', typeLabel: 'See', canton: 'ZH', municipality: '' });
  });
  it('keeps a gg25 municipality named «… am See» a municipality', () => {
    const [h] = mapPlaces(body(row('gg25', '<b>Uetikon am See (ZH)</b>')), { text: 'Uetikon' });
    expect(h).toMatchObject({ name: 'Uetikon am See ZH', kind: 'municipality', typeLabel: '' });
    expect(isLakeArea('Bodensee')).toBe(true);
    expect(isLakeArea('Uetikon am See')).toBe(false);
  });
  it('maps Gipfel/Hauptgipfel/Huegel/Haupthuegel to mountain', () => {
    for (const t of ['Gipfel', 'Hauptgipfel', 'Huegel', 'Haupthuegel']) {
      const [h] = mapPlaces(body(row('gazetteer', `<i>${t}</i> <b>Rigi Kulm</b> (SZ) - Arth`)), { text: 'Rigi' });
      expect(h).toMatchObject({ name: 'Rigi Kulm SZ', kind: 'mountain', typeLabel: t, canton: 'SZ', municipality: 'Arth' });
    }
  });
  it('treats a gazetteer row without type as other with an empty typeLabel', () => {
    const [h] = mapPlaces(body(row('gazetteer', '<b>Rigi Kulm</b> (SZ) - Arth')), { text: 'Rigi' });
    expect(h).toMatchObject({ kind: 'other', typeLabel: '', canton: 'SZ' });
  });
  it('maps any other gazetteer type to other', () => {
    const [h] = mapPlaces(body(row('gazetteer', '<i>Schwimmbadareal</i> <b>Bad</b> (ZH) - Zürichsee (ZH)')), { text: 'Bad' });
    expect(h).toMatchObject({ kind: 'other', typeLabel: 'Schwimmbadareal', municipality: 'Zürichsee (ZH)' });
  });
  it('appends the canton to an Ort without one: "Stäfa" (ZH) -> "Stäfa ZH"', () => {
    const [h] = mapPlaces(body(row('gazetteer', '<i>Ort</i> <b>Stäfa</b> (ZH) - Stäfa')), { text: 'Stäfa' });
    expect(h).toMatchObject({ name: 'Stäfa ZH', kind: 'locality', canton: 'ZH', municipality: 'Stäfa' });
  });
  it('dedupes near-identical hits (same name and kind within 500 m)', () => {
    const hits = mapPlaces(body(
      row('gazetteer', '<i>Ausfahrt</i> <b>Pfäffikon</b> (SZ) - Freienbach', 47.2, 8.78),
      row('gazetteer', '<i>Ausfahrt</i> <b>Pfäffikon</b> (SZ) - Freienbach', 47.2001, 8.7801),
    ), { text: 'Pfäffikon' });
    expect(hits).toHaveLength(1);
    const far = mapPlaces(body(
      row('gazetteer', '<i>Ausfahrt</i> <b>Pfäffikon</b> (SZ) - Freienbach', 47.2, 8.78),
      row('gazetteer', '<i>Ausfahrt</i> <b>Pfäffikon</b> (SZ) - Freienbach', 47.3, 8.78),
    ), { text: 'Pfäffikon' });
    expect(far).toHaveLength(2);
  });
  it('maps zipcode "<b>8712 - Stäfa</b>" to kind zip, name "8712 Stäfa", zip "8712"', () => {
    const [h] = mapPlaces(body(row('zipcode', '<b>8712 - Stäfa</b>')), { text: '8712' });
    expect(h).toMatchObject({ name: '8712 Stäfa', kind: 'zip', zip: '8712', typeLabel: '', canton: '' });
  });
  it('maps an address row to kind address with its zip', () => {
    const [h] = mapPlaces(body(row('address', 'Seestrasse 12 <b>8712 Stäfa</b>')), { text: 'Seestrasse 12' });
    expect(h).toMatchObject({ kind: 'address', zip: '8712', lat: 47.1, lng: 8.7 });
  });
  it('caps at 8 hits and never throws on a malformed body', () => {
    const many = body(...Array.from({ length: 10 }, (_, i) => row('gg25', `<b>Ort${i} (ZH)</b>`, 47 + i, 8)));
    expect(mapPlaces(many, { text: 'Ort' })).toHaveLength(8);
    expect(mapPlaces({} as never, { text: 'x' })).toEqual([]);
    expect(mapPlaces(null as never, { text: 'x' })).toEqual([]);
    expect(mapPlaces(body({ attrs: { origin: 'gg25', label: 5 as never, lat: 'x' as never, lon: 1 } }), { text: 'x' })).toEqual([]);
  });
});

describe('originsFor', () => {
  it('includes address only when the text has a digit', () => {
    expect(originsFor('Pfäffikon, SZ')).toBe('gg25,gazetteer,zipcode');
    expect(originsFor('Seestrasse 12 Stäfa')).toBe('gg25,gazetteer,zipcode,address');
  });
});

describe('placesAdapter', () => {
  it('is a shared, authenticated, secret-free adapter with a 30 day ttl', () => {
    expect(placesAdapter).toMatchObject({ id: 'places-swisstopo', scope: 'shared', requiresAuth: true, secrets: [], ttlSeconds: 30 * 24 * 3600 });
  });
  it('passes only the text on to the cache key and the request', () => {
    expect(placesAdapter.normalizeParams).toBe(placeSearchParams);
    expect(placeSearchParams({ text: 'Stäfa', near: { lat: 47, lng: 8 }, tenantId: 'x' })).toEqual({ text: 'Stäfa' });
    expect(placeSearchParams({ text: 42 })).toEqual({ text: '' });
    expect(placeSearchParams(null)).toEqual({ text: '' });
  });
  it('rejects empty and over-long text before any request', async () => {
    const ctx = {} as never;
    await expect(placesAdapter.fetch({ text: '   ' }, ctx)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(placesAdapter.fetch({ text: 'x'.repeat(101) }, ctx)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
