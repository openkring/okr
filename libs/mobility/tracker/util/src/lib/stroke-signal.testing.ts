/**
 * Synthetic rowing motion for the stroke-detector specs (spec 1.122 §5.2) — never imported by production code.
 * Each stroke is a Gaussian surge pulse (the drive) along `axis`, optionally followed by a second, weaker pulse at
 * 0.45 of the period (the finish bump a phone on the body shows), plus seeded white noise on all three axes.
 */
export interface MotionSample {
  t: number;
  ax: number;
  ay: number;
  az: number;
  speed: number | null;
}

export interface RowingSignalOptions {
  spm: number;
  seconds: number;
  hz?: number;
  doubleBump?: number;
  noise?: number;
  axis?: [number, number, number];
  speed?: number | null;
  seed?: number;
  startMs?: number;
}

/** mulberry32: small seeded PRNG so every spec run sees the same signal. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately normal noise (Irwin–Hall of 6 uniforms, centred). */
function gauss(rand: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand();
  return (s - 3) / Math.sqrt(0.5);
}

export function normalize(v: [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function rowingSignal(o: RowingSignalOptions): { samples: MotionSample[]; trueStrokeTimes: number[] } {
  const hz = o.hz ?? 50;
  const rand = prng(o.seed ?? 1);
  const axis = normalize(o.axis ?? [1, 0, 0]);
  const periodS = 60 / o.spm;
  const width = 0.12 * periodS;
  const startMs = o.startMs ?? 0;
  const amp = 0.3;
  const noise = o.noise ?? 0.02;
  const bump = o.doubleBump ?? 0;
  const trueStrokeTimes: number[] = [];
  for (let k = 0; (k + 0.3) * periodS < o.seconds; k++) trueStrokeTimes.push(startMs + (k + 0.3) * periodS * 1000);
  const samples: MotionSample[] = [];
  const n = Math.round(o.seconds * hz);
  for (let i = 0; i < n; i++) {
    const ts = i / hz;
    const phase = ((ts / periodS - 0.3) % 1 + 1) % 1; // 0 at a stroke peak
    const dMain = Math.min(phase, 1 - phase) * periodS;
    const dBump = Math.abs(phase - 0.45) * periodS;
    const surge = amp * Math.exp(-(dMain * dMain) / (2 * width * width)) + bump * amp * Math.exp(-(dBump * dBump) / (2 * width * width));
    samples.push({
      t: startMs + ts * 1000,
      ax: axis[0] * surge + noise * gauss(rand),
      ay: axis[1] * surge + noise * gauss(rand),
      az: axis[2] * surge + noise * gauss(rand),
      speed: o.speed === undefined ? 3 : o.speed,
    });
  }
  return { samples, trueStrokeTimes };
}

/** Noise only (no rhythm) — drifting or standing at the dock. */
export function stillSignal(o: { seconds: number; hz?: number; noise?: number; speed?: number | null; seed?: number; startMs?: number }): MotionSample[] {
  const hz = o.hz ?? 50;
  const rand = prng(o.seed ?? 2);
  const noise = o.noise ?? 0.02;
  return Array.from({ length: Math.round(o.seconds * hz) }, (_, i) => ({
    t: (o.startMs ?? 0) + (i / hz) * 1000,
    ax: noise * gauss(rand), ay: noise * gauss(rand), az: noise * gauss(rand),
    speed: o.speed === undefined ? 0 : o.speed,
  }));
}
