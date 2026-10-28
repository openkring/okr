import type { TransportMode } from '@okr/shared-models';

/** One section of a crew track as the `getLogbuchTrack` callable returns it (spec 1.123 §5.2): never steps or heart rate. */
export type CrewTrackSection = {
  mode: TransportMode;
  distanceM: number;
  durationS: number;
  splitAvgS?: number;
  splitBestS?: number;
  strokes?: number;
  strokeRateAvg?: number;
  strokeRateMax?: number;
  encoded: string;
  strokeTimes?: string;
};

export type GetLogbuchTrackRes =
  | { state: 'ok'; name: string; deadline: string; sections: CrewTrackSection[] }
  | { state: 'none' | 'gone' | 'denied' };
