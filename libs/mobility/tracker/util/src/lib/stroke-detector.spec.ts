import { describe, expect, it } from 'vitest';
import { StrokeDetector } from './stroke-detector';
import { normalize, rowingSignal, stillSignal, type MotionSample } from './stroke-signal.testing';

function run(samples: MotionSample[]): { strokes: number[]; detector: StrokeDetector } {
  const detector = new StrokeDetector();
  const strokes: number[] = [];
  for (const s of samples) {
    const t = detector.push(s);
    if (t !== undefined) strokes.push(t);
  }
  return { strokes, detector };
}

const within = (actual: number, expected: number, ratio: number) => Math.abs(actual - expected) <= expected * ratio;

describe('StrokeDetector (spec 1.122 §5.2, synthetic signals)', () => {
  it('counts a steady 24 spm row within ±3 %', () => {
    const { samples, trueStrokeTimes } = rowingSignal({ spm: 24, seconds: 300 });
    const { strokes } = run(samples);
    expect(within(strokes.length, trueStrokeTimes.length, 0.03)).toBe(true);
  });

  it('does not depend on the phone orientation', () => {
    for (const axis of [normalize([0.3, -0.8, 0.52]), normalize([-0.6, 0.1, -0.79])]) {
      const { samples, trueStrokeTimes } = rowingSignal({ spm: 24, seconds: 300, axis, seed: 7 });
      expect(within(run(samples).strokes.length, trueStrokeTimes.length, 0.03)).toBe(true);
    }
  });

  it('counts a double bump per stroke (phone on the body) once', () => {
    const { samples, trueStrokeTimes } = rowingSignal({ spm: 24, seconds: 300, doubleBump: 0.6, seed: 3 });
    expect(within(run(samples).strokes.length, trueStrokeTimes.length, 0.03)).toBe(true);
  });

  it('follows a change of rate', () => {
    const fast = rowingSignal({ spm: 32, seconds: 60, seed: 4 });
    const slow = rowingSignal({ spm: 22, seconds: 120, seed: 5, startMs: 60_000 });
    const { strokes, detector } = run([...fast.samples, ...slow.samples]);
    const truth = fast.trueStrokeTimes.length + slow.trueStrokeTimes.length;
    // a 3-minute signal: the 6 s warm-up alone is ~3 strokes; the ±3 % target holds over a full outing (below)
    expect(within(strokes.length, truth, 0.08)).toBe(true);
    const period = detector.periodMs() ?? 0;
    expect(period).toBeGreaterThan(2500);
    expect(period).toBeLessThan(2900);
  });

  it('counts nothing below 1 m/s (drifting, turning)', () => {
    const { samples } = rowingSignal({ spm: 24, seconds: 120, speed: 0.5 });
    expect(run(samples).strokes).toEqual([]);
  });

  it('counts nothing without a GPS speed', () => {
    const { samples } = rowingSignal({ spm: 24, seconds: 60, speed: null });
    expect(run(samples).strokes).toEqual([]);
  });

  it('counts (almost) nothing from noise without a rhythm', () => {
    expect(run(stillSignal({ seconds: 300, speed: 3 })).strokes.length).toBeLessThanOrEqual(2);
  });

  it('counts no strokes during a stop at the dock', () => {
    const a = rowingSignal({ spm: 24, seconds: 120, seed: 8 });
    const stop = stillSignal({ seconds: 30, startMs: 120_000, speed: 0 });
    const b = rowingSignal({ spm: 24, seconds: 120, seed: 9, startMs: 150_000 });
    const { strokes } = run([...a.samples, ...stop, ...b.samples]);
    expect(strokes.filter((t) => t > 121_000 && t < 150_000)).toEqual([]);
    expect(within(strokes.length, a.trueStrokeTimes.length + b.trueStrokeTimes.length, 0.08)).toBe(true);
  });

  it('meets ±3 % over a full 60-minute outing with stops and rate changes', () => {
    const parts: { spm: number; seconds: number }[] = [
      { spm: 20, seconds: 600 }, { spm: 0, seconds: 30 }, { spm: 24, seconds: 900 }, { spm: 30, seconds: 120 },
      { spm: 0, seconds: 30 }, { spm: 22, seconds: 1200 }, { spm: 0, seconds: 60 }, { spm: 24, seconds: 660 },
    ];
    let startMs = 0;
    let truth = 0;
    const samples: MotionSample[] = [];
    parts.forEach((p, i) => {
      if (p.spm === 0) {
        samples.push(...stillSignal({ seconds: p.seconds, startMs, seed: 100 + i }));
      } else {
        const sig = rowingSignal({ spm: p.spm, seconds: p.seconds, startMs, seed: 100 + i, doubleBump: 0.4, axis: normalize([0.2, 0.9, -0.3]) });
        samples.push(...sig.samples);
        truth += sig.trueStrokeTimes.length;
      }
      startMs += p.seconds * 1000;
    });
    expect(within(run(samples).strokes.length, truth, 0.03)).toBe(true);
  });
});
