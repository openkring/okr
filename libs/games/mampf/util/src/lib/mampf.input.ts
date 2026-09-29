import { Dir } from './mampf.types';

/** A swipe of at least `threshold` px along its dominant axis → that direction; shorter → `null`. */
export function swipeDirection(dx: number, dy: number, threshold: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
