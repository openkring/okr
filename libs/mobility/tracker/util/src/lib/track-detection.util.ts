import type { TransportMode } from '@okr/shared-models';
import type { MotionActivityType } from './motion-activity.model';

export interface DetectionInput {
  activity: MotionActivityType;
  confidence: 'low' | 'medium' | 'high';
  speedMps: number | null;
  altitudeM: number | null;
  at: number; // ms epoch
}

export interface DetectState {
  mode: TransportMode;
  locked: boolean;
  candidate?: TransportMode;
  candidateSince?: number;
}

export const DETECTION_STABLE_MS = 120_000;
const TRAIN_MIN_SPEED_MPS = 36;
const PLANE_MIN_ALTITUDE_M = 3000;
const PLANE_MIN_SPEED_MPS = 83;
const LOCKING_MODES: TransportMode[] = ['row', 'ski', 'ship'];

/** The mode the sensors currently suggest, or undefined when they say nothing usable. */
export function proposeMode(i: DetectionInput): TransportMode | undefined {
  if (i.confidence === 'low') return undefined;
  if (i.activity === 'stationary' || i.activity === 'unknown') return undefined;
  const speed = i.speedMps ?? 0;
  if (i.altitudeM !== null && i.altitudeM > PLANE_MIN_ALTITUDE_M && speed > PLANE_MIN_SPEED_MPS) return 'plane';
  if (speed > TRAIN_MIN_SPEED_MPS) return 'train';
  switch (i.activity) {
    case 'walking':
    case 'running':
      return 'foot';
    case 'cycling':
      return 'bike';
    case 'automotive':
      return 'car';
  }
}

/** row, ski and ship cannot be told apart by sensors, so they lock detection; so does any mode chosen by hand. */
export function initialDetectState(mode: TransportMode, chosenByHand: boolean): DetectState {
  return { mode, locked: chosenByHand || LOCKING_MODES.includes(mode) };
}

export function detectStep(s: DetectState, i: DetectionInput): { state: DetectState; switchTo?: TransportMode } {
  if (s.locked) return { state: s };
  const proposal = proposeMode(i);
  if (proposal === undefined) return { state: s }; // no information: keep waiting
  if (proposal === s.mode) return { state: { mode: s.mode, locked: s.locked } };
  if (s.candidate !== proposal || s.candidateSince === undefined) {
    return { state: { ...s, candidate: proposal, candidateSince: i.at } };
  }
  if (i.at - s.candidateSince >= DETECTION_STABLE_MS) {
    return { state: { mode: proposal, locked: s.locked }, switchTo: proposal };
  }
  return { state: s };
}
