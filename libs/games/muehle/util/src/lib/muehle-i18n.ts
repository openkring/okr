import { Signal } from '@angular/core';

const PFX = '@games/muehle/feature.';

export const MUEHLE_I18N_KEYS = {
  title:             PFX + 'title',
  subtitle:          PFX + 'subtitle',
  board_label:       PFX + 'board_label',

  // the two selects
  opponent_label:    PFX + 'config.opponent_label',
  opponent_easy:     PFX + 'config.opponent_easy',
  opponent_medium:   PFX + 'config.opponent_medium',
  opponent_hard:     PFX + 'config.opponent_hard',
  opponent_human:    PFX + 'config.opponent_human',
  color_label:       PFX + 'config.color_label',
  color_white:       PFX + 'config.color_white',
  color_black:       PFX + 'config.color_black',

  // the footer buttons
  undo:              PFX + 'action.undo',
  restart:           PFX + 'action.restart',

  // the two stone trays; those carrying {params} are filled with `fill()`
  white:             PFX + 'player.white',
  black:             PFX + 'player.black',
  who_you:           PFX + 'player.you',
  who_computer:      PFX + 'player.computer',
  who_player:        PFX + 'player.player',
  tray_meta:         PFX + 'player.tray_meta',

  // the status line
  status_you:        PFX + 'status.you',
  status_place:      PFX + 'status.place',
  status_select:     PFX + 'status.select',
  status_select_fly: PFX + 'status.select_fly',
  status_target:     PFX + 'status.target',
  status_target_fly: PFX + 'status.target_fly',
  status_remove:     PFX + 'status.remove',
  status_thinking:   PFX + 'status.thinking',
  status_draw:       PFX + 'status.draw',
  status_win_you:    PFX + 'status.win_you',
  status_win_computer: PFX + 'status.win_computer',
  status_win_named:  PFX + 'status.win_named',
  reason_no_moves:   PFX + 'status.reason_no_moves',
  reason_two_stones: PFX + 'status.reason_two_stones',

  // the rules
  rules_title:       PFX + 'rules.title',
  rules_place:       PFX + 'rules.place',
  rules_move:        PFX + 'rules.move',
  rules_mill:        PFX + 'rules.mill',
  rules_fly:         PFX + 'rules.fly',
  rules_end:         PFX + 'rules.end',
} satisfies Record<string, string>;

export type MuehleI18n = { [K in keyof typeof MUEHLE_I18N_KEYS]: Signal<string> };
