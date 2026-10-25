import type { TransportMode } from '@okr/shared-models';

/** Polyline colour per transport mode: distinct and readable on a topographic map. Plane is drawn dashed. */
export const TRACK_MODE_COLOR: Record<TransportMode, string> = {
  foot: '#0f6e63',
  car: '#b5651d',
  plane: '#6a3d9a',
  ship: '#1f5fa8',
  bus: '#c2185b',
  train: '#d62828',
  bike: '#2e7d32',
  row: '#00838f',
  ski: '#5c6bc0',
  motorbike: '#4e342e',
};
