import { describe, expect, it } from 'vitest';

import { ownsKeyboard, swipeDirection } from './mampf.input';

describe('swipeDirection', () => {
  it('ignores movements below the threshold', () => {
    expect(swipeDirection(10, -20, 24)).toBeNull();
  });

  it('follows the dominant axis', () => {
    expect(swipeDirection(30, 10, 24)).toBe('right');
    expect(swipeDirection(-30, 29, 24)).toBe('left');
    expect(swipeDirection(5, 40, 24)).toBe('down');
    expect(swipeDirection(-5, -40, 24)).toBe('up');
  });
});

describe('ownsKeyboard', () => {
  const board = document.createElement('div');
  const canvas = document.createElement('canvas');
  board.appendChild(canvas);
  document.body.appendChild(board);

  it('takes Space/Enter when nothing or the board has focus', () => {
    expect(ownsKeyboard(null, board)).toBe(true);
    expect(ownsKeyboard(document.body, board)).toBe(true);
    expect(ownsKeyboard(canvas, board)).toBe(true);
  });

  it('leaves them to every other control on the page', () => {
    for (const tag of ['button', 'summary', 'a', 'input', 'ion-menu-button', 'ion-item']) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(ownsKeyboard(el, board), tag).toBe(false);
    }
  });
});
