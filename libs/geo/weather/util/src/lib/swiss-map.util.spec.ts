import { describe, expect, it } from 'vitest';
import { SWISS_MAP_VIEWBOX, projectToSwissMap } from './swiss-map.util';

describe('projectToSwissMap', () => {
  it('puts the north-west corner of the box at the origin', () => {
    expect(projectToSwissMap(47.81, 5.96)).toEqual({ x: 0, y: 0 });
  });

  it('puts the south-east corner at the far edge', () => {
    expect(projectToSwissMap(45.82, 10.49))
      .toEqual({ x: SWISS_MAP_VIEWBOX.width, y: SWISS_MAP_VIEWBOX.height });
  });

  it('grows y southwards, not northwards', () => {
    const zurich = projectToSwissMap(47.37, 8.54);
    const lugano = projectToSwissMap(46.01, 8.95);
    expect(lugano.y).toBeGreaterThan(zurich.y);   // Lugano is further south
    expect(lugano.x).toBeGreaterThan(zurich.x);   // and slightly further east
  });

  it('places a known location plausibly', () => {
    const staefa = projectToSwissMap(47.24, 8.72);
    expect(staefa.x).toBeGreaterThan(560);
    expect(staefa.x).toBeLessThan(640);
    expect(staefa.y).toBeGreaterThan(150);
    expect(staefa.y).toBeLessThan(220);
  });

  it('clamps a location outside the box to the edge instead of off the canvas', () => {
    const munich = projectToSwissMap(48.14, 11.58);   // north-east of Switzerland
    expect(munich).toEqual({ x: SWISS_MAP_VIEWBOX.width, y: 0 });
    const milan = projectToSwissMap(45.46, 9.19);     // south of the box
    expect(milan.y).toBe(SWISS_MAP_VIEWBOX.height);
  });
});
