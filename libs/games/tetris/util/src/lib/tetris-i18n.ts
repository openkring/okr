import { Signal } from '@angular/core';

const PFX = '@games/tetris/feature.';

export const TETRIS_I18N_KEYS = {
  title:          PFX + 'title',
  board_label:    PFX + 'board_label',

  // the side panel
  hold:           PFX + 'hud.hold',
  next:           PFX + 'hud.next',
  score:          PFX + 'hud.score',
  level:          PFX + 'hud.level',
  lines:          PFX + 'hud.lines',
  best:           PFX + 'hud.best',

  // the overlay on the well; those carrying {params} are filled with `fill()`
  ready:          PFX + 'overlay.ready',
  paused:         PFX + 'overlay.paused',
  over:           PFX + 'overlay.over',
  over_score:     PFX + 'overlay.over_score',
  new_best:       PFX + 'overlay.new_best',

  // the score pop-up after a line clear
  clear_1:        PFX + 'clear.single',
  clear_2:        PFX + 'clear.double',
  clear_3:        PFX + 'clear.triple',
  clear_4:        PFX + 'clear.four',
  clear_b2b:      PFX + 'clear.back_to_back',
  clear_combo:    PFX + 'clear.combo',

  // buttons
  start:          PFX + 'action.start',
  resume:         PFX + 'action.resume',
  pause:          PFX + 'action.pause',
  restart:        PFX + 'action.restart',
  again:          PFX + 'action.again',
  left:           PFX + 'action.left',
  right:          PFX + 'action.right',
  rotate:         PFX + 'action.rotate',
  rotate_ccw:     PFX + 'action.rotate_ccw',
  soft_drop:      PFX + 'action.soft_drop',
  hard_drop:      PFX + 'action.hard_drop',
  hold_action:    PFX + 'action.hold',

  // the rules
  rules_title:    PFX + 'rules.title',
  rules_goal:     PFX + 'rules.goal',
  rules_keys:     PFX + 'rules.keys',
  rules_touch:    PFX + 'rules.touch',
  rules_hold:     PFX + 'rules.hold',
  rules_score:    PFX + 'rules.score',
} satisfies Record<string, string>;

export type TetrisI18n = { [K in keyof typeof TETRIS_I18N_KEYS]: Signal<string> };
