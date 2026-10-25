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
  stop(): Promise<void>;
  addListener(event: 'location', cb: (l: NativeLocation) => void): Promise<PluginListenerHandle>;
  addListener(event: 'activity', cb: (a: MotionActivity) => void): Promise<PluginListenerHandle>;
}

export const TrackerLocation = registerPlugin<TrackerLocationPlugin>('TrackerLocation');
