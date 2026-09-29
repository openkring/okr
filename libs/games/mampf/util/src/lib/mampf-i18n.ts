import { Signal } from '@angular/core';

const PFX = '@games/mampf/feature.';

export const MAMPF_I18N_KEYS = {
  title:            PFX + 'title',
  canvas_label:     PFX + 'canvas_label',

  // the score line above the maze; `hud_lives` carries {count}, filled with `fill()`
  hud_score:        PFX + 'hud.score',
  hud_high:         PFX + 'hud.high',
  hud_level:        PFX + 'hud.level',
  hud_lives:        PFX + 'hud.lives',

  // buttons
  start:            PFX + 'action.start',
  pause:            PFX + 'action.pause',
  resume:           PFX + 'action.resume',
  restart:          PFX + 'action.restart',
  again:            PFX + 'action.again',
  sound_on:         PFX + 'action.sound_on',
  sound_off:        PFX + 'action.sound_off',
  dpad_on:          PFX + 'action.dpad_on',
  dpad_off:         PFX + 'action.dpad_off',

  // d-pad aria labels
  dir_up:           PFX + 'dir.up',
  dir_down:         PFX + 'dir.down',
  dir_left:         PFX + 'dir.left',
  dir_right:        PFX + 'dir.right',

  // overlays over the maze; `overlay_level` carries {level}, `overlay_score` carries {score}
  overlay_idle:     PFX + 'overlay.idle',
  overlay_ready:    PFX + 'overlay.ready',
  overlay_level:    PFX + 'overlay.level',
  overlay_paused:   PFX + 'overlay.paused',
  overlay_over:     PFX + 'overlay.over',
  overlay_score:    PFX + 'overlay.score',
  overlay_new_high: PFX + 'overlay.new_high',

  hint_keys:        PFX + 'hint.keys',
  hint_touch:       PFX + 'hint.touch',

  // the rules card
  rules_title:      PFX + 'rules.title',
  rules_goal:       PFX + 'rules.goal',
  rules_pellet:     PFX + 'rules.pellet',
  rules_lives:      PFX + 'rules.lives',
  ghost_chaser:     PFX + 'ghost.chaser',
  ghost_ambusher:   PFX + 'ghost.ambusher',
  ghost_fickle:     PFX + 'ghost.fickle',
  ghost_shy:        PFX + 'ghost.shy',
} satisfies Record<string, string>;

export type MampfI18n = { [K in keyof typeof MAMPF_I18N_KEYS]: Signal<string> };
