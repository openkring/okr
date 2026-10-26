import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { MotionActivity, TrackAccuracy } from '@okr/mobility-tracker-util';

export type { MotionActivity, MotionActivityType } from '@okr/mobility-tracker-util';

/**
 * Own native location + Core Motion plugin for the tracker (spec 1.121 §13), implemented in Swift in the bkg iOS
 * project (`ios/App/App/TrackerLocationPlugin.swift`). The stationary power saving lives in Swift so it works
 * while the WebView is suspended; `setProfile` undoes it.
 */
export interface NativeLocation {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  time: number; // ms since epoch
}

export interface TrackerLocationPlugin {
  permission(): Promise<{
    location: 'always' | 'whenInUse' | 'denied' | 'notDetermined';
    motion: 'granted' | 'denied' | 'notDetermined';
  }>;
  requestAlways(): Promise<void>;
  /** Idempotent: a second call only replaces the profile. */
  start(o: { distanceFilter: number; accuracy: TrackAccuracy; minIntervalMs?: number; motion: boolean }): Promise<void>;
  /** Switches profile without a stop/start gap. */
  setProfile(o: { distanceFilter: number; accuracy: TrackAccuracy; minIntervalMs?: number }): Promise<void>;
  /** Also closes a running calibration recording. */
  stop(): Promise<void>;
  /** Pedometer steps between two times (spec 1.122); `null` when step counting is unavailable or not allowed. */
  steps(o: { fromMs: number; toMs: number }): Promise<{ steps: number | null }>;
  /** Starts the raw rowing-motion CSV (Documents-relative path); idempotent. */
  calibrationStart(): Promise<{ file: string }>;
  /** Stops it; `file: null` when no recording ran. */
  calibrationStop(): Promise<{ file: string; samples: number } | { file: null }>;
  /** Stroke detection on the motion stream (spec 1.122 2c): on while a row section records. */
  strokes(o: { on: boolean }): Promise<void>;
  /** Runs the native stroke detector over a calibration CSV (Documents-relative path): the debug check against the TS detector. */
  replayCalibration(o: { file: string }): Promise<{ strokes: number[] }>;
  addListener(event: 'location', cb: (l: NativeLocation) => void): Promise<PluginListenerHandle>;
  addListener(event: 'activity', cb: (a: MotionActivity) => void): Promise<PluginListenerHandle>;
  /** One detected stroke: its time (ms epoch) and the current stroke period. */
  addListener(event: 'stroke', cb: (s: { time: number; periodMs: number | null }) => void): Promise<PluginListenerHandle>;
}

export const TrackerLocation = registerPlugin<TrackerLocationPlugin>('TrackerLocation');

/** Pedometer steps for a time window, or undefined (web, no permission, unavailable) — the shape withQueriedSteps takes. */
export function queryPedometerSteps(fromMs: number, toMs: number): Promise<number | undefined> {
  return TrackerLocation.steps({ fromMs, toMs }).then((r) => r.steps ?? undefined, () => undefined);
}
