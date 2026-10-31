import { describe, expect, it } from 'vitest';
import { finishRun, isUsable, layerTilesToFree, migrateOfflineMap, NO_OFFLINE_LAYER, offlineAreaKey, OfflineLayerStatus, parseOfflineLayer } from './journal-offline-area.util';
import { MapArea } from './journal-map-area.util';
import { TileJob } from './journal-tiles.util';

const job = (path: string): TileJob => ({ source: 'osm', z: 1, x: 0, y: 0, url: '', path });
const ISLANDS: MapArea = {
  id: 'subantarctic-islands', name: 'Islands', source: 'gibs', bbox: [-70, -55, -30, -50], maxZoom: 8,
  layers: [{ kind: 'satellite', maxZoom: 8 }, { kind: 'osm', maxZoom: 8 }],
};

describe('offline area state', () => {
  it('state keys include the journal', () => {
    expect(offlineAreaKey('j1', 'a', 'osm')).toBe('offlineArea:j1:a:osm');
    expect(offlineAreaKey('j1', 'a', 'osm')).not.toBe(offlineAreaKey('j2', 'a', 'osm'));
  });

  it('migration marks derived layers', () => {
    const m = migrateOfflineMap({ state: 'ready', at: 't', areaIds: ['subantarctic-islands'], total: 10, failed: 0 }, [ISLANDS]);
    expect(m['subantarctic-islands:satellite'].state).toBe('ready');
    expect(m['subantarctic-islands:osm'].state).toBe('ready');
    const p = migrateOfflineMap({ state: 'partial', at: 't', areaIds: ['subantarctic-islands'], total: 10, failed: 1 }, [ISLANDS]);
    expect(p['subantarctic-islands:osm'].state).toBe('partial');
  });

  it('empty tiles count toward ready', () => {
    const s = finishRun(NO_OFFLINE_LAYER, { total: 100, done: 100, failed: 0, empty: 30, added: 70 }, 't');
    expect(s.state).toBe('ready');
    expect(finishRun(NO_OFFLINE_LAYER, { total: 100, done: 99, failed: 1, empty: 0, added: 99 }, 't').state).toBe('partial');
  });

  it('partial over 10 % failed is not usable', () => {
    const base: OfflineLayerStatus = { ...NO_OFFLINE_LAYER, state: 'partial', total: 100 };
    expect(isUsable({ ...base, failed: 10 })).toBe(true);
    expect(isUsable({ ...base, failed: 11 })).toBe(false);
    expect(isUsable({ ...base, state: 'ready' })).toBe(true);
    expect(isUsable(NO_OFFLINE_LAYER)).toBe(false);
  });

  it('parses damaged input as none', () => {
    expect(parseOfflineLayer(undefined)).toEqual(NO_OFFLINE_LAYER);
    expect(parseOfflineLayer('{oops')).toEqual(NO_OFFLINE_LAYER);
    expect(parseOfflineLayer(JSON.stringify({ state: 'ready', total: 5 })).total).toBe(5);
  });

  it("freeing one layer keeps tiles another journal's layer needs", () => {
    expect(layerTilesToFree([job('a'), job('b')], [job('b')])).toEqual(['a']);
  });
});
