import type { ProcessorEntry } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { NODE_HEIGHT, NODE_WIDTH, countryGroupOf, layoutProcessingMap } from './processing-map.layout';

const entry = (over: Partial<ProcessorEntry> = {}): ProcessorEntry => ({
  key: 'k', name: 'N', legalEntity: 'L', role: 'processor', category: 'saasService',
  country: 'CH', transferMechanism: 'domestic', purposes: [], dataClasses: ['identity'],
  retentionText: '', securityMeasures: [], dpaUrl: '', privacyUrl: '', contact: '',
  ...over,
});

const entries = (n: number) => Array.from({ length: n }, (_, i) => entry({ key: `p${i}`, name: `P${i}` }));

describe('layoutProcessingMap', () => {
  it('places the app at the centre', () => {
    const l = layoutProcessingMap([], 800, 600);
    expect(l.centre).toEqual({ x: 400, y: 300 });
  });

  it('distributes n processors evenly on the ring', () => {
    const l = layoutProcessingMap(entries(4), 800, 600);
    expect(l.nodes.map((n) => Math.round(n.angleDeg))).toEqual([0, 90, 180, 270]);
  });

  it('keeps every node box inside the viewport', () => {
    for (const n of layoutProcessingMap(entries(12), 800, 600).nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + NODE_WIDTH).toBeLessThanOrEqual(800);
      expect(n.y + NODE_HEIGHT).toBeLessThanOrEqual(600);
    }
  });

  it('labels each edge with the processor data classes', () => {
    const l = layoutProcessingMap([entry({ dataClasses: ['identity', 'financial'] })], 800, 600);
    expect(l.edges[0].label).toContain('identity');
    expect(l.edges[0].label).toContain('financial');
  });

  it('draws exactly one edge per node, anchored at the centre', () => {
    const l = layoutProcessingMap(entries(5), 800, 600);
    expect(l.edges.length).toBe(l.nodes.length);
    for (const e of l.edges) {
      expect(e.x1).toBe(l.centre.x);
      expect(e.y1).toBe(l.centre.y);
    }
  });

  it('handles the empty case without dividing by zero', () => {
    const l = layoutProcessingMap([], 800, 600);
    expect(l.nodes).toEqual([]);
    expect(l.edges).toEqual([]);
  });

  it('places a single processor away from the centre, not on top of it', () => {
    // One node sits at angle 0, i.e. directly above the centre — so cx is legitimately
    // 400 and only the distance tells you the ring was applied.
    const { centre, nodes: [node] } = layoutProcessingMap(entries(1), 800, 600);
    const distance = Math.hypot(node.cx - centre.x, node.cy - centre.y);
    expect(distance).toBeCloseTo(Math.min(800, 600) * 0.4);
  });

  it('survives a viewport too small for the ring', () => {
    for (const n of layoutProcessingMap(entries(6), 120, 90).nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('carries the key through, so a node can link to its detail page', () => {
    expect(layoutProcessingMap(entries(3), 800, 600).nodes.map((n) => n.key)).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('countryGroupOf', () => {
  it('calls Switzerland domestic', () => {
    expect(countryGroupOf('CH')).toBe('ch');
  });

  it('groups the EEA together', () => {
    expect(countryGroupOf('IE')).toBe('eu');
    expect(countryGroupOf('DE')).toBe('eu');
    expect(countryGroupOf('PT')).toBe('eu');
  });

  it('treats everything else as a third country — the row an auditor looks at first', () => {
    expect(countryGroupOf('US')).toBe('third');
    expect(countryGroupOf('')).toBe('third');
  });
});
