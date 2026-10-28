/** A pin position on screen, in pixels. */
export interface FanPoint { x: number; y: number }
/** Pixel offset of a pin from its own position. */
export interface FanOffset { dx: number; dy: number }

/**
 * Spreads pins that would cover each other: pins closer than `threshold` px to the first pin of a group join that
 * group, and a group of n > 1 is laid out on a circle around the group's centre, starting at 12 o'clock and going
 * clockwise in input order. The circle is just large enough that neighbouring pins of `pinSize` px do not overlap
 * (at least one pin size). A single pin keeps its place (offset 0/0).
 * Pure pixel arithmetic, so the map recomputes it for every zoom level.
 */
export function fanOutOffsets(points: FanPoint[], threshold: number, pinSize: number): FanOffset[] {
  const groups: { anchor: FanPoint; members: number[] }[] = [];
  points.forEach((p, i) => {
    const group = groups.find(g => Math.hypot(g.anchor.x - p.x, g.anchor.y - p.y) < threshold);
    if (group) group.members.push(i);
    else groups.push({ anchor: p, members: [i] });
  });
  const offsets: FanOffset[] = points.map(() => ({ dx: 0, dy: 0 }));
  for (const { members } of groups) {
    const n = members.length;
    if (n < 2) continue;
    const cx = members.reduce((s, i) => s + points[i].x, 0) / n;
    const cy = members.reduce((s, i) => s + points[i].y, 0) / n;
    // chord between neighbours = 2r·sin(π/n) ≥ pinSize + a small gap
    const radius = Math.max(pinSize, (pinSize + 4) / (2 * Math.sin(Math.PI / n)));
    members.forEach((i, k) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * k) / n;
      offsets[i] = {
        dx: Math.round(cx + radius * Math.cos(angle) - points[i].x),
        dy: Math.round(cy + radius * Math.sin(angle) - points[i].y),
      };
    });
  }
  return offsets;
}
