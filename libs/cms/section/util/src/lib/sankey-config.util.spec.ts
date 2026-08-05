import { describe, expect, it } from 'vitest';

import { SankeyConfig } from '@okr/shared-models';
import { parseSankeyFlows, sankeyNodes, stringifySankeyFlows, toSankeyOption, validFlows, withSankeyDefaults } from './sankey-config.util';

const config: SankeyConfig = {
  flows: [
    { source: 'Beiträge', target: 'Verein', value: 100 },
    { source: 'Verein', target: 'Regatta', value: 60 },
    { source: 'Verein', target: 'Unterhalt', value: 40 },
  ],
  nodeWidth: 30,
  nodeGap: 10,
  lineOpacity: 0.4,
  layoutIterations: 0,
};

describe('withSankeyDefaults', () => {
  it('fills every field for a legacy/undefined config', () => {
    expect(withSankeyDefaults(undefined)).toEqual({ flows: [], nodeWidth: 40, nodeGap: 20, lineOpacity: 0.6, layoutIterations: 0 });
  });
  it('keeps explicit values, including 0', () => {
    const cfg = withSankeyDefaults({ ...config, nodeGap: 0 });
    expect(cfg.nodeGap).toBe(0);
    expect(cfg.nodeWidth).toBe(30);
  });
});

describe('validFlows', () => {
  it('drops incomplete, self-referencing and non-positive flows', () => {
    const flows = validFlows([
      { source: 'A', target: 'B', value: 5 },
      { source: '', target: 'B', value: 5 },
      { source: 'A', target: 'A', value: 5 },
      { source: 'A', target: 'B', value: 0 },
      { source: 'A', target: 'B', value: NaN },
    ] as any);
    expect(flows).toEqual([{ source: 'A', target: 'B', value: 5 }]);
  });
});

describe('sankeyNodes', () => {
  it('derives unique nodes in first-seen order', () => {
    expect(sankeyNodes(config.flows)).toEqual(['Beiträge', 'Verein', 'Regatta', 'Unterhalt']);
  });
});

describe('toSankeyOption', () => {
  it('returns undefined when there is nothing renderable', () => {
    expect(toSankeyOption(undefined)).toBeUndefined();
    expect(toSankeyOption({ ...config, flows: [] })).toBeUndefined();
  });
  it('maps nodes, links and layout settings', () => {
    const series = (toSankeyOption(config)?.['series'] as any[])[0];
    expect(series.type).toBe('sankey');
    expect(series.data).toHaveLength(4);
    expect(series.links).toHaveLength(3);
    expect(series.nodeWidth).toBe(30);
    expect(series.nodeGap).toBe(10);
    expect(series.lineStyle.opacity).toBe(0.4);
  });
});

describe('parseSankeyFlows / stringifySankeyFlows', () => {
  it('round-trips a flow list', () => {
    expect(parseSankeyFlows(stringifySankeyFlows(config.flows))).toEqual(config.flows);
  });
  it('returns undefined for invalid JSON or a non-array', () => {
    expect(parseSankeyFlows('{')).toBeUndefined();
    expect(parseSankeyFlows('{"a":1}')).toBeUndefined();
  });
  it('stringifies an empty list to an empty string', () => {
    expect(stringifySankeyFlows([])).toBe('');
  });
});
