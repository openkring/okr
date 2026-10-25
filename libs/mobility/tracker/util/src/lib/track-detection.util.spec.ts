import { describe, expect, it } from 'vitest';
import { DETECTION_STABLE_MS, detectStep, initialDetectState, proposeMode } from './track-detection.util';
import type { DetectState, DetectionInput } from './track-detection.util';

const inp = (activity: DetectionInput['activity'], at: number, extra: Partial<DetectionInput> = {}): DetectionInput => ({
  activity,
  confidence: 'high',
  speedMps: null,
  altitudeM: null,
  at,
  ...extra,
});

describe('proposeMode', () => {
  it('maps activities', () => {
    expect(proposeMode(inp('walking', 0))).toBe('foot');
    expect(proposeMode(inp('running', 0))).toBe('foot');
    expect(proposeMode(inp('cycling', 0))).toBe('bike');
    expect(proposeMode(inp('automotive', 0))).toBe('car');
  });
  it('train above 36 m/s', () => expect(proposeMode(inp('automotive', 0, { speedMps: 40 }))).toBe('train'));
  it('plane above 3000 m and 83 m/s', () => expect(proposeMode(inp('automotive', 0, { altitudeM: 9000, speedMps: 230 }))).toBe('plane'));
  it('stationary/unknown/low never propose', () => {
    expect(proposeMode(inp('stationary', 0))).toBeUndefined();
    expect(proposeMode(inp('unknown', 0))).toBeUndefined();
    expect(proposeMode(inp('walking', 0, { confidence: 'low' }))).toBeUndefined();
  });
});

function run(state: DetectState, inputs: DetectionInput[]) {
  let s = state;
  const switches: { at: number; to: string }[] = [];
  for (const i of inputs) {
    const r = detectStep(s, i);
    s = r.state;
    if (r.switchTo) switches.push({ at: i.at, to: r.switchTo });
  }
  return { s, switches };
}

describe('detectStep', () => {
  const car = initialDetectState('car', false);
  it('car -> walking 125 s switches to foot at first input >= 120 s', () => {
    const inputs = [0, 30_000, 60_000, 90_000, 119_000, 120_000, 125_000].map((t) => inp('walking', t));
    const { s, switches } = run(car, inputs);
    expect(switches).toEqual([{ at: 120_000, to: 'foot' }]);
    expect(s.mode).toBe('foot');
    expect(DETECTION_STABLE_MS).toBe(120_000);
  });
  it('walking 30 s then automotive: no switch, candidate cleared', () => {
    const { s, switches } = run(car, [inp('walking', 0), inp('walking', 30_000), inp('automotive', 31_000)]);
    expect(switches).toEqual([]);
    expect(s.candidate).toBeUndefined();
    expect(s.candidateSince).toBeUndefined();
  });
  it('cycling 130 s -> bike', () => {
    const { switches } = run(car, [inp('cycling', 0), inp('cycling', 65_000), inp('cycling', 130_000)]);
    expect(switches).toEqual([{ at: 130_000, to: 'bike' }]);
  });
  it('stationary 10 min: no switch', () => {
    const { switches } = run(car, [0, 300_000, 600_000].map((t) => inp('stationary', t)));
    expect(switches).toEqual([]);
  });
  it('locked row ignores walking', () => {
    const { s, switches } = run(initialDetectState('row', false), [0, 300_000, 600_000].map((t) => inp('walking', t)));
    expect(switches).toEqual([]);
    expect(s.mode).toBe('row');
  });
  it('initialDetectState locks ski/ship/row', () => {
    expect(initialDetectState('ski', false).locked).toBe(true);
    expect(initialDetectState('ship', false).locked).toBe(true);
    expect(initialDetectState('car', false).locked).toBe(false);
  });
  it('chosenByHand locks any mode', () => expect(initialDetectState('car', true).locked).toBe(true));
  it('a proposal equal to the current mode clears the candidate', () => {
    const { s } = run(car, [inp('walking', 0), inp('automotive', 10_000)]);
    expect(s.candidate).toBeUndefined();
  });
});
