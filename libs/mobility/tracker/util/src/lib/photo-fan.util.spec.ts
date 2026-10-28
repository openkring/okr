import { describe, expect, it } from 'vitest';
import { fanOutOffsets } from './photo-fan.util';

describe('fanOutOffsets', () => {
  it('leaves single pins where they are', () => {
    expect(fanOutOffsets([{ x: 0, y: 0 }, { x: 100, y: 0 }], 24, 32)).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });

  it('spreads two pins at the same place onto opposite sides of a circle, the first one on top', () => {
    const [a, b] = fanOutOffsets([{ x: 50, y: 50 }, { x: 50, y: 50 }], 24, 32);
    expect(a).toEqual({ dx: 0, dy: -32 });
    expect(b.dx).toBe(0);
    expect(b.dy).toBe(32);
  });

  it('keeps neighbouring pins of a larger group from overlapping', () => {
    const points = Array.from({ length: 8 }, () => ({ x: 10, y: 10 }));
    const placed = fanOutOffsets(points, 24, 32).map(o => ({ x: 10 + o.dx, y: 10 + o.dy }));
    for (let k = 0; k < placed.length; k++) {
      const next = placed[(k + 1) % placed.length];
      expect(Math.hypot(next.x - placed[k].x, next.y - placed[k].y)).toBeGreaterThanOrEqual(32);
    }
  });

  it('groups only pins within the threshold of the group anchor', () => {
    const offsets = fanOutOffsets([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 200, y: 200 }], 24, 32);
    expect(offsets[2]).toEqual({ dx: 0, dy: 0 });
    expect(offsets[0]).not.toEqual({ dx: 0, dy: 0 });
    expect(offsets[1]).not.toEqual({ dx: 0, dy: 0 });
  });
});
