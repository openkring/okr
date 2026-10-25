export type MotionActivityType = 'walking' | 'running' | 'cycling' | 'automotive' | 'stationary' | 'unknown';

export interface MotionActivity {
  type: MotionActivityType;
  confidence: 'low' | 'medium' | 'high';
  timestamp: number;
}
