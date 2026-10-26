/**
 * Streaming rowing-stroke detector (spec 1.122 §5.2). Orientation-free and rhythm first:
 * 1. project each acceleration sample onto the axis that currently varies most (exponential covariance + one
 *    power-iteration step per sample) — a phone in a bag sees the body swing, a mounted one the boat surge;
 * 2. band-pass (high-pass by subtracting a slow EMA, low-pass by a fast EMA);
 * 3. once a second, estimate the stroke period from the autocorrelation of the last 10 s (decimated to 10 Hz);
 * 4. count ONE stroke per period: the highest peak in each period window — a weaker finish bump never counts;
 * 5. only while the rhythm is regular and the GPS speed says the boat moves.
 *
 * The Swift twin (apps/bkg-app … StrokeDetector.swift) is a line-by-line port: change both together.
 * STARTING VALUES — tuned once calibration recordings exist (Bruno 2026-10-26: build now, tune later).
 */
export const STROKE_DETECTOR = {
  hz: 50,
  axisTauS: 4,
  hpTauS: 2,
  lpTauS: 0.15,
  decimate: 5, // 50 Hz → 10 Hz for the autocorrelation
  acfWindow: 100, // 10 s at 10 Hz
  acfMinFill: 60, // first estimate after 6 s
  acfEverySamples: 50, // once a second
  minSpm: 14,
  maxSpm: 45,
  rhythmMinCorr: 0.5,
  nearBestCorr: 0.9, // the shortest lag within 90 % of the best wins (no period doubling)
  confirmAfter: 0.5, // a candidate peak is a stroke when no higher sample came for 0.5 × period
  minSpacing: 0.6, // strokes are at least 0.6 × period apart
  minSpeedMps: 1,
} as const;

export interface StrokeSample {
  t: number; // ms epoch
  ax: number; // userAcceleration, g
  ay: number;
  az: number;
  speed: number | null; // latest GPS speed in m/s (null = unknown or stale)
}

const C = STROKE_DETECTOR;
const alpha = (tauS: number) => 1 - Math.exp(-1 / (C.hz * tauS));

export class StrokeDetector {
  private readonly aAxis = alpha(C.axisTauS);
  private readonly aHp = alpha(C.hpTauS);
  private readonly aLp = alpha(C.lpTauS);
  private readonly minLag = Math.round((60 / C.maxSpm) * (C.hz / C.decimate));
  private readonly maxLag = Math.round((60 / C.minSpm) * (C.hz / C.decimate));

  // covariance (symmetric 3×3: xx, xy, xz, yy, yz, zz) and the current principal axis
  private readonly cov = [0, 0, 0, 0, 0, 0];
  private axis: [number, number, number] = [1, 0, 0];
  private hpMean = 0;
  private lp = 0;
  private readonly ring = new Float64Array(C.acfWindow);
  private ringCount = 0;
  private ringPos = 0;
  private sampleNo = 0;
  private period: number | undefined; // ms
  private rhythm = false;
  private candT: number | undefined;
  private candY = 0;
  private lastStroke: number | undefined;

  /** Feeds one 50 Hz sample; returns the time of a stroke this sample confirmed. */
  public push(s: StrokeSample): number | undefined {
    const y = this.filter(s);
    this.sampleNo++;
    if (this.sampleNo % C.decimate === 0) this.pushRing(y);
    if (this.sampleNo % C.acfEverySamples === 0) this.estimatePeriod();
    return this.pickPeak(s.t, y, s.speed);
  }

  /** Current stroke period in ms while the rhythm is regular. */
  public periodMs(): number | undefined {
    return this.rhythm ? this.period : undefined;
  }

  private filter(s: StrokeSample): number {
    const { ax: x, ay: y, az: z } = s;
    const c = this.cov;
    const a = this.aAxis;
    c[0] += a * (x * x - c[0]); c[1] += a * (x * y - c[1]); c[2] += a * (x * z - c[2]);
    c[3] += a * (y * y - c[3]); c[4] += a * (y * z - c[4]); c[5] += a * (z * z - c[5]);
    const [vx, vy, vz] = this.axis;
    let nx = c[0] * vx + c[1] * vy + c[2] * vz;
    let ny = c[1] * vx + c[3] * vy + c[4] * vz;
    let nz = c[2] * vx + c[4] * vy + c[5] * vz;
    const n = Math.hypot(nx, ny, nz);
    if (n > 1e-12) {
      nx /= n; ny /= n; nz /= n;
      if (nx * vx + ny * vy + nz * vz < 0) { nx = -nx; ny = -ny; nz = -nz; } // keep the sign stable
      this.axis = [nx, ny, nz];
    }
    const p = this.axis[0] * x + this.axis[1] * y + this.axis[2] * z;
    this.hpMean += this.aHp * (p - this.hpMean);
    this.lp += this.aLp * (p - this.hpMean - this.lp);
    return this.lp;
  }

  private pushRing(y: number): void {
    this.ring[this.ringPos] = y;
    this.ringPos = (this.ringPos + 1) % C.acfWindow;
    this.ringCount = Math.min(this.ringCount + 1, C.acfWindow);
  }

  private estimatePeriod(): void {
    const n = this.ringCount;
    if (n < C.acfMinFill || n <= this.maxLag) {
      this.rhythm = false;
      return;
    }
    // oldest → newest, mean removed
    const x = new Float64Array(n);
    const start = (this.ringPos - n + C.acfWindow) % C.acfWindow;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += (x[i] = this.ring[(start + i) % C.acfWindow]);
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) { x[i] -= mean; energy += x[i] * x[i]; }
    if (energy <= 1e-12) {
      this.rhythm = false;
      return;
    }
    const r = new Float64Array(this.maxLag + 2);
    let best = -Infinity;
    for (let lag = this.minLag - 1; lag <= this.maxLag + 1 && lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
      r[lag] = (sum / energy) * (n / (n - lag)); // unbiased
      if (lag >= this.minLag && lag <= this.maxLag && r[lag] > best) best = r[lag];
    }
    if (best < C.rhythmMinCorr) {
      this.rhythm = false;
      return;
    }
    // the shortest lag that is a local maximum close to the best: never the double period
    let lag = this.minLag;
    for (let l = this.minLag; l <= this.maxLag; l++) {
      if (r[l] >= C.nearBestCorr * best && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { lag = l; break; }
    }
    // parabolic refinement
    const d = r[lag - 1] - 2 * r[lag] + r[lag + 1];
    const shift = d !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (r[lag - 1] - r[lag + 1])) / d)) : 0;
    this.period = ((lag + shift) * C.decimate * 1000) / C.hz;
    this.rhythm = true;
  }

  private pickPeak(t: number, y: number, speed: number | null): number | undefined {
    const period = this.period;
    if (!this.rhythm || period === undefined) {
      this.candT = undefined;
      return undefined;
    }
    if (this.lastStroke !== undefined && t - this.lastStroke < C.minSpacing * period) return undefined;
    if (this.candT === undefined || y > this.candY) {
      if (y > 0) { this.candT = t; this.candY = y; }
      return undefined;
    }
    if (t - this.candT < C.confirmAfter * period) return undefined;
    const stroke = this.candT;
    this.candT = undefined;
    if (speed === null || speed < C.minSpeedMps) return undefined; // drifting or no GPS: the rhythm stays, no count
    this.lastStroke = stroke;
    return stroke;
  }
}
