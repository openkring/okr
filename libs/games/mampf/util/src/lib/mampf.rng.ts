/** mulberry32 — advances `holder.seed` and returns a number in [0, 1). Deterministic per seed. */
export function nextRandom(holder: { seed: number }): number {
  let t = (holder.seed = (holder.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
