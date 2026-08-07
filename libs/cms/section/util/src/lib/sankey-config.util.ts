import { SANKEY_CONFIG_SHAPE, SankeyConfig, SankeyFlow } from '@okr/shared-models';

/**
 * Helpers for the sankey section: default coalescing, flow validation and the mapping to an
 * ECharts option. Nodes are derived from the flows — there is no separate node list to keep in sync.
 *
 * The option is returned as a plain `Record<string, unknown>` so neither this lib nor the dumb UI
 * lib needs a dependency on `echarts`; the renderer casts it to `EChartsOption`.
 */
export type SankeyOption = Record<string, unknown>;

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withSankeyDefaults(config: SankeyConfig | undefined): SankeyConfig {
  return {
    flows: config?.flows ?? SANKEY_CONFIG_SHAPE.flows,
    nodeWidth: config?.nodeWidth ?? SANKEY_CONFIG_SHAPE.nodeWidth,
    nodeGap: config?.nodeGap ?? SANKEY_CONFIG_SHAPE.nodeGap,
    lineOpacity: config?.lineOpacity ?? SANKEY_CONFIG_SHAPE.lineOpacity,
    layoutIterations: config?.layoutIterations ?? SANKEY_CONFIG_SHAPE.layoutIterations,
  };
}

/** Keeps only flows ECharts can draw: two distinct non-empty node names and a positive value. */
export function validFlows(flows: SankeyFlow[] | undefined): SankeyFlow[] {
  return (flows ?? []).filter((f) =>
    typeof f?.source === 'string' && f.source.trim().length > 0 &&
    typeof f?.target === 'string' && f.target.trim().length > 0 &&
    f.source !== f.target &&
    typeof f.value === 'number' && Number.isFinite(f.value) && f.value > 0
  );
}

/** All node names appearing in the flows, in first-seen order (source before target). */
export function sankeyNodes(flows: SankeyFlow[]): string[] {
  const names = new Set<string>();
  for (const flow of flows) {
    names.add(flow.source);
    names.add(flow.target);
  }
  return [...names];
}

/** Maps the section config to an ECharts sankey option; undefined when there is nothing to draw. */
export function toSankeyOption(config: SankeyConfig | undefined): SankeyOption | undefined {
  const cfg = withSankeyDefaults(config);
  const flows = validFlows(cfg.flows);
  if (flows.length === 0) return undefined;
  return {
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey',
      data: sankeyNodes(flows).map((name) => ({ name })),
      links: flows.map((f) => ({ source: f.source, target: f.target, value: f.value })),
      nodeWidth: cfg.nodeWidth,
      nodeGap: cfg.nodeGap,
      layoutIterations: cfg.layoutIterations,
      emphasis: { focus: 'adjacency' },
      label: { color: 'inherit' },
      lineStyle: { color: 'gradient', opacity: cfg.lineOpacity },
    }],
  };
}

/** Parses the flows JSON from the editor; undefined for invalid JSON or a non-array. */
export function parseSankeyFlows(text: string): SankeyFlow[] | undefined {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as SankeyFlow[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Pretty-prints the flows as JSON; '' for an empty list. */
export function stringifySankeyFlows(flows: SankeyFlow[] | undefined): string {
  if (!flows || flows.length === 0) return '';
  return JSON.stringify(flows, null, 2);
}
