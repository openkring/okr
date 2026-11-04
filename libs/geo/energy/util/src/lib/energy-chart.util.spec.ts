import { describe, expect, it } from 'vitest';

import { EnergyTariff } from '@okr/shared-models';

import { tariffChartOption, trendChartOption } from './energy-chart.util';

type Series = { name?: string; type?: string; stack?: string; connectNulls?: boolean; data: unknown[] };

const LABELS = { energy: 'Energie', gridUsage: 'Netz', charge: 'Abgaben', aidFee: 'Förderabgabe', future: 'angekündigt', unit: 'ct./kWh' };

function tariff(year: number, operatorName: string): EnergyTariff {
  return { year, operatorName, total: 8, energy: 4, gridUsage: 2, charge: 1, aidFee: 1 };
}

describe('trendChartOption', () => {
  it('keeps a gap as a gap', () => {
    const opt = trendChartOption([{ name: 'x', points: [['20210331', null], ['20210430', 5]] }], 'kWp');
    const series = opt.series as Series[];
    expect(series[0].data[0]).toEqual(['20210331', null]);
    expect(series[0].connectNulls).toBe(false);
  });
  it('draws one line per series', () => {
    const opt = trendChartOption([{ name: 'a', points: [] }, { name: 'b', points: [] }], 'MWh');
    expect((opt.series as Series[]).map((s) => s.name)).toEqual(['a', 'b']);
  });
});

describe('tariffChartOption', () => {
  const rows = [tariff(2025, 'A'), tariff(2026, 'A'), tariff(2027, 'A'), tariff(2026, 'B')];

  it('stacks the four components for one operator', () => {
    const opt = tariffChartOption(rows.filter((r) => r.operatorName === 'A'), LABELS, 2026);
    const series = opt.series as Series[];
    expect(series.map((s) => s.name)).toEqual(['Energie', 'Netz', 'Abgaben', 'Förderabgabe']);
    expect(new Set(series.map((s) => s.stack)).size).toBe(1);
    expect((opt.xAxis as { data: string[] }).data).toEqual(['2025', '2026', '2027 (angekündigt)']);
  });
  it('takes the y-axis name from the label, not from a hard-coded unit', () => {
    const opt = tariffChartOption(rows.filter((r) => r.operatorName === 'A'), LABELS, 2026);
    expect((opt.yAxis as { name: string }).name).toBe('ct./kWh');
  });
  it('lightens a future year and names it', () => {
    const opt = tariffChartOption(rows.filter((r) => r.operatorName === 'A'), LABELS, 2026);
    const energy = (opt.series as Series[])[0].data as { value: number; itemStyle?: { opacity?: number } }[];
    expect(energy[1].itemStyle?.opacity).toBeUndefined();
    expect(energy[2].itemStyle?.opacity).toBeLessThan(1);
    expect((opt.xAxis as { data: string[] }).data[2]).toContain('angekündigt');
  });
});
