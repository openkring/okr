import { describe, expect, it } from 'vitest';

import { SpiderConfig } from '@okr/shared-models';
import { alignedSeries, parseSpiderList, stringifySpiderList, toSpiderOption, validAxes, withSpiderDefaults } from './spider-config.util';

const config: SpiderConfig = {
  axes: [
    { name: 'Technik', maxValue: 10 },
    { name: 'Kondition', maxValue: 10 },
    { name: 'Taktik', maxValue: 5 },
  ],
  series: [
    { name: 'Selbstbild', values: [8, 6, 4] },
    { name: 'Fremdbild', values: [6, 7, 3] },
  ],
  shape: 'polygon',
  areaOpacity: 0.3,
  showLegend: true,
};

describe('withSpiderDefaults', () => {
  it('fills every field for a legacy/undefined config', () => {
    expect(withSpiderDefaults(undefined)).toEqual({ axes: [], series: [], shape: 'polygon', areaOpacity: 0.2, showLegend: true });
  });
  it('keeps explicit values, including 0 and false', () => {
    const cfg = withSpiderDefaults({ ...config, areaOpacity: 0, showLegend: false });
    expect(cfg.areaOpacity).toBe(0);
    expect(cfg.showLegend).toBe(false);
  });
});

describe('validAxes', () => {
  it('drops nameless and non-positive axes', () => {
    expect(validAxes([
      { name: 'A', maxValue: 10 },
      { name: '', maxValue: 10 },
      { name: 'B', maxValue: 0 },
      { name: 'C', maxValue: NaN },
    ] as any)).toEqual([{ name: 'A', maxValue: 10 }]);
  });
});

describe('alignedSeries', () => {
  it('pads, cuts and clamps the values to the axes', () => {
    expect(alignedSeries([{ name: 'S', values: [99, -3] }], config.axes)).toEqual([{ name: 'S', values: [10, 0, 0] }]);
  });
  it('drops nameless series', () => {
    expect(alignedSeries([{ name: '', values: [1, 2, 3] }] as any, config.axes)).toEqual([]);
  });
});

describe('toSpiderOption', () => {
  it('returns undefined when there is nothing renderable', () => {
    expect(toSpiderOption(undefined)).toBeUndefined();
    expect(toSpiderOption({ ...config, series: [] })).toBeUndefined();
    expect(toSpiderOption({ ...config, axes: config.axes.slice(0, 2) })).toBeUndefined(); // < 3 axes
  });
  it('maps indicators, series and the legend', () => {
    const option = toSpiderOption(config)!;
    expect((option['radar'] as any).indicator).toEqual([
      { name: 'Technik', max: 10 }, { name: 'Kondition', max: 10 }, { name: 'Taktik', max: 5 },
    ]);
    const series = (option['series'] as any[])[0];
    expect(series.type).toBe('radar');
    expect(series.data).toHaveLength(2);
    expect(series.areaStyle.opacity).toBe(0.3);
    expect((option['legend'] as any).data).toEqual(['Selbstbild', 'Fremdbild']);
  });
  it('omits the legend when disabled', () => {
    expect(toSpiderOption({ ...config, showLegend: false })?.['legend']).toBeUndefined();
  });
});

describe('parseSpiderList / stringifySpiderList', () => {
  it('round-trips a list', () => {
    expect(parseSpiderList(stringifySpiderList(config.axes))).toEqual(config.axes);
  });
  it('returns undefined for invalid JSON or a non-array', () => {
    expect(parseSpiderList('{')).toBeUndefined();
    expect(parseSpiderList('{"a":1}')).toBeUndefined();
  });
  it('stringifies an empty list to an empty string', () => {
    expect(stringifySpiderList([])).toBe('');
  });
});
