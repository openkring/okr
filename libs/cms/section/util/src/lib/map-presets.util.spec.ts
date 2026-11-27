import { describe, expect, it } from 'vitest';
import { LocationModel, MAP_CONFIG_SHAPE, MapConfig } from '@okr/shared-models';

import {
  addMapLocation, applyMapCanvasView, mapEditableConfig, mapEffectiveZoom, applyMapLocateButton, applyMapStartPlace, applyMapStartTenant, applyMapStartView, applyMapZoom, mapPinFieldsOf,
  mapPinOf, mapPinsOf, mapPlaceOf, mapShowsLocateButton, mapStartOf, mapZoomChoiceOf, removeMapLocation, toggleMapPinField,
} from './map-presets.util';

const config = (over: Partial<MapConfig> = {}): MapConfig => ({ ...MAP_CONFIG_SHAPE, ...over });
const location = (over: Partial<LocationModel> = {}): LocationModel => ({ ...new LocationModel('scs'), ...over });

const boathouse = location({ okey: 'boat', name: 'Bootshaus', address: 'Seestrasse 1', latitude: 47.3401234, longitude: 8.5401234, what3words: 'a.b.c', seaLevel: 406 });
const harbour = location({ okey: 'harbour', name: 'Hafen', latitude: 47.35, longitude: 8.55 });

describe('start', () => {
  it('reads the club location from useCurrentLocationAsCenter', () => {
    expect(mapStartOf(config({ useCurrentLocationAsCenter: true }), [boathouse])).toBe('tenant');
  });
  it('reads a location whose coordinates are the centre', () => {
    const c = applyMapStartPlace(config(), boathouse);
    expect(mapStartOf(c, [harbour, boathouse])).toBe('place');
    expect(mapPlaceOf(c, [harbour, boathouse])?.okey).toBe('boat');
  });
  it('reads any other centre as a view of its own', () => {
    expect(mapStartOf(config({ useCurrentLocationAsCenter: false, centerLatitude: 46, centerLongitude: 7 }), [boathouse])).toBe('view');
  });
  it('never takes a location without coordinates for the centre 0/0', () => {
    expect(mapStartOf(config({ useCurrentLocationAsCenter: false }), [location({ okey: 'x' })])).toBe('view');
  });
  it('keeps the stored centre when switching to the club location', () => {
    const c = applyMapStartTenant(config({ useCurrentLocationAsCenter: false, centerLatitude: 46 }));
    expect(c.useCurrentLocationAsCenter).toBe(true);
    expect(c.centerLatitude).toBe(46);
  });
  it('rounds a view to 6 decimals and a whole zoom', () => {
    const c = applyMapStartView(config(), { lat: 47.12345678, lng: 8.98765432, zoom: 12.6 });
    expect(c).toMatchObject({ useCurrentLocationAsCenter: false, centerLatitude: 47.123457, centerLongitude: 8.987654, zoom: 13 });
  });
});

describe('canvas view', () => {
  it('stores centre and zoom with the start view', () => {
    const c = applyMapCanvasView(config({ useCurrentLocationAsCenter: false }), { lat: 47, lng: 8, zoom: 14 }, 'view');
    expect(c).toMatchObject({ centerLatitude: 47, centerLongitude: 8, zoom: 14 });
  });
  it('takes only the zoom with any other start', () => {
    const c = applyMapCanvasView(config({ useCurrentLocationAsCenter: true }), { lat: 47, lng: 8, zoom: 14 }, 'tenant');
    expect(c).toMatchObject({ centerLatitude: 0, centerLongitude: 0, zoom: 14, useCurrentLocationAsCenter: true });
  });
  it('returns the config itself for an unchanged view', () => {
    const c = config({ useCurrentLocationAsCenter: false, centerLatitude: 47, centerLongitude: 8, zoom: 14 });
    expect(applyMapCanvasView(c, { lat: 47.0000001, lng: 8, zoom: 14 }, 'view')).toBe(c);
    expect(applyMapCanvasView(c, { lat: 1, lng: 2, zoom: 14 }, 'place')).toBe(c);
  });
});

describe('zoom', () => {
  it('maps choices to zooms and back', () => {
    expect(applyMapZoom(config(), 'street').zoom).toBe(17);
    expect(mapZoomChoiceOf(15)).toBe('quarter');
    expect(mapZoomChoiceOf(11)).toBeUndefined();
  });
});

describe('locate button', () => {
  it('follows useCurrentLocationAsCenter while not stored', () => {
    expect(mapShowsLocateButton(config({ useCurrentLocationAsCenter: true }))).toBe(true);
    expect(mapShowsLocateButton(config({ useCurrentLocationAsCenter: false }))).toBe(false);
  });
  it('is its own once stored', () => {
    expect(mapShowsLocateButton(applyMapLocateButton(config({ useCurrentLocationAsCenter: true }), false))).toBe(false);
    expect(mapShowsLocateButton(applyMapLocateButton(config({ useCurrentLocationAsCenter: false }), true))).toBe(true);
  });
});

describe('pins', () => {
  it('adds a location once, at the end', () => {
    const c = addMapLocation(addMapLocation(config(), 'boat'), 'harbour');
    expect(c.locationKeys).toEqual(['boat', 'harbour']);
    expect(addMapLocation(c, 'boat')).toBe(c);
  });
  it('removes a pin and drops the empty list', () => {
    const c = addMapLocation(config(), 'boat');
    expect(removeMapLocation(c, 'boat')).not.toHaveProperty('locationKeys');
    expect(removeMapLocation(c, 'other')).toBe(c);
  });
  it('shows the name while no fields are stored', () => {
    expect(mapPinFieldsOf(config())).toEqual(['name']);
  });
  it('toggles fields in a fixed order', () => {
    const c = toggleMapPinField(toggleMapPinField(config(), 'seaLevel'), 'address');
    expect(c.pinFields).toEqual(['name', 'address', 'seaLevel']);
    expect(toggleMapPinField(c, 'name').pinFields).toEqual(['address', 'seaLevel']);
  });
  it('makes the first non-empty field the title and the others its text', () => {
    expect(mapPinOf(boathouse, ['name', 'address', 'what3words', 'seaLevel'])).toEqual({
      id: 'boat', lat: boathouse.latitude, lng: boathouse.longitude, title: 'Bootshaus', snippet: 'Seestrasse 1 · ///a.b.c · 406 m',
    });
    expect(mapPinOf(harbour, ['address', 'name']).title).toBe('Hafen');
  });
  it('lists pins in the stored order and skips missing or unplaced locations', () => {
    const c = config({ locationKeys: ['harbour', 'gone', 'nowhere', 'boat'] });
    const pins = mapPinsOf(c, [boathouse, harbour, location({ okey: 'nowhere' })]);
    expect(pins.map((p) => p.id)).toEqual(['harbour', 'boat']);
  });
});

describe('legacy zoom', () => {
  it('shows a stored club-location map at 15, whatever it stored', () => {
    expect(mapEffectiveZoom(config({ useCurrentLocationAsCenter: true, zoom: 10 }))).toBe(15);
    expect(mapEffectiveZoom(config({ useCurrentLocationAsCenter: false, zoom: 10 }))).toBe(10);
    expect(mapEffectiveZoom(config({ useCurrentLocationAsCenter: true, zoom: 10, showLocateButton: true }))).toBe(10);
  });
  it('states button and zoom as readers see them for the editor', () => {
    expect(mapEditableConfig(config({ useCurrentLocationAsCenter: true, zoom: 10 }))).toMatchObject({ showLocateButton: true, zoom: 15 });
    const saved = config({ useCurrentLocationAsCenter: true, zoom: 10, showLocateButton: false });
    expect(mapEditableConfig(saved)).toBe(saved);
  });
});
