import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Core Motion activity for the tracker (spec 1.121), implemented in Swift in the bkg iOS project
 * (`ios/App/App/TrackerMotionPlugin.swift`). Emits an `activity` event on every classification change.
 */
export type MotionActivityType = 'walking' | 'running' | 'cycling' | 'automotive' | 'stationary' | 'unknown';

export interface MotionActivity {
  type: MotionActivityType;
  confidence: 'low' | 'medium' | 'high';
  timestamp: number; // ms since epoch
}

export interface TrackerMotionPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'activity', cb: (a: MotionActivity) => void): Promise<PluginListenerHandle>;
}

export const TrackerMotion = registerPlugin<TrackerMotionPlugin>('TrackerMotion');
