import { Dir } from './mampf.types';

/**
 * Whether Space/Enter at `target` belong to the game: only when nothing in particular has focus
 * (the body) or the focus is on the maze itself. Every other element — the header's menu and
 * back buttons, the rules' summary, buttons, links, side-menu items — keeps its own keys.
 */
export function ownsKeyboard(target: EventTarget | null, board: Element | null): boolean {
  if (!target || !(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  return !!board && board.contains(target) && !target.closest('button, ion-button');
}

/** A swipe of at least `threshold` px along its dominant axis → that direction; shorter → `null`. */
export function swipeDirection(dx: number, dy: number, threshold: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
