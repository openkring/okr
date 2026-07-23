// apps/functions/src/_gateway/adapters/oecd.spec.ts
import { describe, it, expect } from 'vitest';
import { mapOecd, oecdSourceTimestamp, oecdUrl } from './oecd';
import { OECD_SAMPLE } from './oecd.fixture';

describe('mapOecd', () => {
  it('flattens observations with period, value and dimension ids', () => {
    const out = mapOecd(OECD_SAMPLE as never);
    expect(out.observations).toEqual([
      { period: '2023', value: 1.2, dimensions: { REF_AREA: 'CHE', TIME_PERIOD: '2023' } },
      { period: '2024', value: 1.5, dimensions: { REF_AREA: 'CHE', TIME_PERIOD: '2024' } },
    ]);
  });

  it('reports the dimension metadata', () => {
    const out = mapOecd(OECD_SAMPLE as never);
    expect(out.dimensions).toEqual([
      { id: 'REF_AREA', name: 'Reference area' },
      { id: 'TIME_PERIOD', name: 'Time period' },
    ]);
  });

  it('returns empty observations for an empty dataset', () => {
    const empty = { meta: {}, data: { structures: [{ dimensions: { observation: [] } }], dataSets: [{ observations: {} }] } };
    expect(mapOecd(empty as never).observations).toEqual([]);
  });
});

describe('oecdSourceTimestamp', () => {
  it('reads meta.prepared', () => {
    expect(oecdSourceTimestamp(OECD_SAMPLE as never)).toBe('2026-07-20T09:00:00Z');
  });
  it('is null when absent', () => {
    expect(oecdSourceTimestamp({ data: {} } as never)).toBeNull();
  });
});

describe('oecdUrl', () => {
  it('builds the SDMX data URL with filter and periods', () => {
    const url = oecdUrl({ dataflowId: 'DSD_EO@DF_EO', filter: 'CHE.GDP', startPeriod: '2020', endPeriod: '2024' });
    expect(url).toContain('/data/DSD_EO@DF_EO/CHE.GDP');
    expect(url).toContain('startPeriod=2020');
    expect(url).toContain('endPeriod=2024');
    expect(url).toContain('dimensionAtObservation=AllDimensions');
  });
  it('defaults the filter to "all"', () => {
    expect(oecdUrl({ dataflowId: 'X' })).toContain('/data/X/all?');
  });
});
