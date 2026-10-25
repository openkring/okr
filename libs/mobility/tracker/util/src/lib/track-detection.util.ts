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
  candidateLastSeen?: number; // last input that matched the candidate
}

export const DETECTION_STABLE_MS = 120_000;
/** A candidate is only confirmed if its proposals arrive at most this far apart. */
export const DETECTION_GAP_MS = 60_000;
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

/**
 * row, ski and ship cannot be told apart by sensors, so they lock detection until changed by hand (design §5.3).
 * Any other mode — detected or chosen by hand — leaves detection running.
 */
export function initialDetectState(mode: TransportMode): DetectState {
  return { mode, locked: LOCKING_MODES.includes(mode) };
}

export function detectStep(s: DetectState, i: DetectionInput): { state: DetectState; switchTo?: TransportMode } {
  if (s.locked) return { state: s };
  const proposal = proposeMode(i);
  if (proposal === undefined) {
    // a confident "stationary" breaks the streak; unknown / low confidence say nothing
    if (i.activity === 'stationary' && i.confidence !== 'low') return { state: { mode: s.mode, locked: s.locked } };
    return { state: s };
  }
  if (proposal === s.mode) return { state: { mode: s.mode, locked: s.locked } };
  const continues = s.candidate === proposal && s.candidateSince !== undefined && s.candidateLastSeen !== undefined && i.at - s.candidateLastSeen <= DETECTION_GAP_MS;
  if (!continues) {
    return { state: { ...s, candidate: proposal, candidateSince: i.at, candidateLastSeen: i.at } };
  }
  if (i.at - (s.candidateSince as number) >= DETECTION_STABLE_MS) {
    return { state: { mode: proposal, locked: s.locked }, switchTo: proposal };
  }
  return { state: { ...s, candidateLastSeen: i.at } };
}
